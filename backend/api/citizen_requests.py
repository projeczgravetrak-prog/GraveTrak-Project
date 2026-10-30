"""Persistent citizen inbox; transfer requests never move occupants implicitly."""
from django.db import transaction
from django.utils import timezone
from rest_framework import mixins, permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from .models import BurialApplication, CitizenRequest, Notification
from .permissions import get_role, has_capability


def manages_requests(user):
    return has_capability(user, 'manage_applications')


class RequestSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    appId = serializers.CharField(source='application.application_id', read_only=True, default='')
    deceased = serializers.CharField(source='application.deceased_name', read_only=True, default='')
    currentLocation = serializers.CharField(source='application.burial_location', read_only=True, default='')
    date = serializers.DateTimeField(source='created_at', read_only=True)
    resolved = serializers.SerializerMethodField()
    isRead = serializers.BooleanField(source='office_read', read_only=True)
    admin = serializers.SerializerMethodField()
    message = serializers.CharField(max_length=4000, trim_whitespace=True)

    class Meta:
        model = CitizenRequest
        fields = ['id', 'application', 'kind', 'message', 'status', 'cancellation_reason', 'reply',
                  'responded_at', 'reply_dismissed', 'created_at', 'updated_at',
                  'user', 'appId', 'deceased', 'currentLocation', 'date', 'resolved', 'isRead', 'admin']
        read_only_fields = ['status', 'cancellation_reason', 'reply', 'responded_at', 'reply_dismissed', 'created_at', 'updated_at']

    def get_user(self, obj):
        return obj.submitted_by.get_full_name() or obj.submitted_by.username

    def get_admin(self, obj):
        return (obj.responded_by.get_full_name() or 'Office') if obj.responded_by else 'Office'

    def get_resolved(self, obj):
        return obj.status != 'open'

    def validate(self, attrs):
        user = self.context['request'].user
        if get_role(user) != 'user':
            raise PermissionDenied('Only citizens can submit these requests.')
        application = attrs.get('application')
        if application and application.submitted_by_id != user.pk:
            raise ValidationError({'application': 'Choose one of your own applications.'})
        if attrs['kind'] == 'transfer':
            if not application or application.status not in ('slot_assigned', 'scheduled', 'completed'):
                raise ValidationError({'application': 'A transfer request requires your assigned burial application.'})
        return attrs


class RequestText(serializers.Serializer):
    message = serializers.CharField(max_length=4000, trim_whitespace=True)


class CitizenRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                            mixins.CreateModelMixin, viewsets.GenericViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = RequestSerializer
    pagination_class = None

    def get_queryset(self):
        queryset = CitizenRequest.objects.select_related('submitted_by', 'application', 'responded_by')
        if manages_requests(self.request.user):
            return queryset
        return queryset.filter(submitted_by=self.request.user)

    @transaction.atomic
    def perform_create(self, serializer):
        # Lock the application so simultaneous transfer submissions cannot both pass.
        application = serializer.validated_data.get('application')
        if application:
            application = BurialApplication.objects.select_for_update().get(pk=application.pk)
        if serializer.validated_data['kind'] == 'transfer':
            if application.status not in ('slot_assigned', 'scheduled', 'completed'):
                raise ValidationError('This application is no longer eligible for a transfer request.')
            if CitizenRequest.objects.filter(application=application, kind='transfer', status='open').exists():
                raise ValidationError('A transfer request for this application is already awaiting review.')
        serializer.save(submitted_by=self.request.user)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def cancel(self, request, pk=None):
        record = CitizenRequest.objects.select_for_update().get(pk=self.get_object().pk)
        if record.submitted_by_id != request.user.pk:
            raise PermissionDenied('Only the request owner can cancel it.')
        payload = RequestText(data=request.data)
        payload.is_valid(raise_exception=True)
        if record.status == 'cancelled':
            return Response(self.get_serializer(record).data)
        if record.status != 'open':
            raise ValidationError('This request has already been processed.')
        record.status = 'cancelled'
        record.cancellation_reason = payload.validated_data['message']
        record.save(update_fields=['status', 'cancellation_reason', 'updated_at'])
        return Response(self.get_serializer(record).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reply(self, request, pk=None):
        if not manages_requests(request.user):
            raise PermissionDenied('Only the application office can respond.')
        payload = RequestText(data=request.data)
        payload.is_valid(raise_exception=True)
        record = CitizenRequest.objects.select_for_update().get(pk=self.get_object().pk)
        if record.status != 'open':
            raise ValidationError('This request is already closed. Refresh the inbox.')
        record.reply = payload.validated_data['message']
        record.status = 'resolved'
        record.office_read = True
        record.responded_by = request.user
        record.responded_at = timezone.now()
        record.save()
        # In-app only: no external message is sent by this endpoint.
        Notification.objects.create(recipient=record.submitted_by, application=record.application,
            notification_type='system_alert', title='Office reply received',
            message='The office has responded to your request. Open Contact Support history for details.')
        return Response(self.get_serializer(record).data)

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        if not manages_requests(request.user):
            raise PermissionDenied('Only the application office can mark incoming requests read.')
        record = self.get_object()
        CitizenRequest.objects.filter(pk=record.pk).update(office_read=True)
        record.office_read = True
        return Response(self.get_serializer(record).data)

    @action(detail=True, methods=['post'], url_path='dismiss-reply')
    def dismiss_reply(self, request, pk=None):
        record = self.get_object()
        if record.submitted_by_id != request.user.pk:
            raise PermissionDenied('Only the recipient can dismiss a reply.')
        CitizenRequest.objects.filter(pk=record.pk).update(reply_dismissed=True)
        return Response({'detail': 'Reply dismissed. The request remains in your history.'})
