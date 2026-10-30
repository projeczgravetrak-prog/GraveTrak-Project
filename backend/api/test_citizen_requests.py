from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient

from .models import BurialApplication, BurialDocument, CitizenRequest, Notification, StatusAuditLog, UserProfile


@override_settings(BREVO_EMAIL_ENABLED=False, PHILSMS_ENABLED=False, STORAGES={
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
})
class CitizenWorkflowTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.owner = User.objects.create_user('citizen-workflow-owner')
        cls.other = User.objects.create_user('citizen-workflow-other')
        cls.office = User.objects.create_user('citizen-workflow-office')
        cls.staff = User.objects.create_user('citizen-workflow-staff')
        for user, role in [(cls.owner, 'user'), (cls.other, 'user'), (cls.office, 'mayor'), (cls.staff, 'staff')]:
            UserProfile.objects.create(user=user, role=role)

    def setUp(self):
        self.client.force_authenticate(self.owner)
        self.application = BurialApplication.objects.create(application_id='CITIZEN-FLOW', submitted_by=self.owner,
            deceased_name='Fixture only', deceased_date_of_death=timezone.localdate(), applicant_name='Fixture')
        self.url = '/api/citizen-requests/'

    def test_message_is_persisted_and_visible_only_to_owner_and_office(self):
        response = self.client.post(self.url, {'kind': 'support', 'message': 'Please explain the requirements.',
                                             'application': self.application.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        record = CitizenRequest.objects.get(pk=response.data['id'])
        self.assertEqual(record.submitted_by, self.owner)
        other_device = APIClient()
        other_device.force_authenticate(self.owner)
        self.assertEqual(other_device.get(self.url).data[0]['message'], record.message)
        for user in (self.other, self.staff):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.url).data, [])
            self.assertEqual(self.client.get(f'{self.url}{record.pk}/').status_code, 404)
        self.client.force_authenticate(self.office)
        self.assertEqual(self.client.get(self.url).data[0]['id'], record.pk)

    def test_untrusted_application_and_guest_are_rejected(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(self.url, {'kind': 'support', 'message': 'Hello',
            'application': self.application.pk}, format='json').status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post(self.url, {'kind': 'support', 'message': 'Hello'}).status_code, 401)
        self.assertFalse(CitizenRequest.objects.exists())

    def test_office_reply_survives_new_client_and_never_changes_inventory(self):
        self.application.status = 'completed'
        self.application.burial_location = 'Recorded original location'
        self.application.save()
        response = self.client.post(self.url, {'kind': 'transfer', 'message': 'Request relocation',
                                              'application': self.application.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data['id']
        self.assertEqual(self.client.post(f'{self.url}{pk}/reply/', {'message': 'Pretend office'}).status_code, 403)
        self.client.force_authenticate(self.office)
        self.assertEqual(self.client.post(f'{self.url}{pk}/mark-read/').status_code, 200)
        result = self.client.post(f'{self.url}{pk}/reply/', {'message': 'Please visit the office for verification.'})
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(self.client.post(f'{self.url}{pk}/reply/', {'message': 'Duplicate'}).status_code, 400)
        self.application.refresh_from_db()
        self.assertEqual(self.application.burial_location, 'Recorded original location')
        self.assertEqual(self.application.status, 'completed')
        self.assertEqual(Notification.objects.filter(recipient=self.owner).count(), 1)
        self.client.force_authenticate(self.owner)
        record = self.client.get(f'{self.url}{pk}/').data
        self.assertEqual(record['status'], 'resolved')
        self.assertIn('verification', record['reply'])
        self.assertEqual(self.client.post(f'{self.url}{pk}/dismiss-reply/').status_code, 200)
        self.assertTrue(self.client.get(f'{self.url}{pk}/').data['reply_dismissed'])

    def test_transfer_requires_assignment_prevents_duplicates_and_cancels_persistently(self):
        payload = {'kind': 'transfer', 'message': 'Move request', 'application': self.application.pk}
        self.assertEqual(self.client.post(self.url, payload).status_code, 400)
        self.application.status = 'slot_assigned'
        self.application.save()
        first = self.client.post(self.url, payload)
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(self.client.post(self.url, payload).status_code, 400)
        url = f'{self.url}{first.data["id"]}/cancel/'
        self.assertEqual(self.client.post(url, {'message': ''}).status_code, 400)
        self.assertEqual(self.client.post(url, {'message': 'No longer needed'}).status_code, 200)
        self.assertEqual(CitizenRequest.objects.get(pk=first.data['id']).status, 'cancelled')

    def test_application_cancellation_is_owner_scoped_audited_and_idempotent(self):
        url = f'/api/burial-applications/{self.application.pk}/cancel/'
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(url, {'reason': 'Not mine'}).status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(url, {'reason': ''}).status_code, 400)
        for _ in range(2):
            self.assertEqual(self.client.post(url, {'reason': 'Family changed plans'}).status_code, 200)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'cancelled')
        self.assertTrue(self.application.is_terminal_state)
        self.assertEqual(StatusAuditLog.objects.filter(application=self.application, new_status='cancelled').count(), 1)
        self.client.force_authenticate(self.office)
        row = self.client.get('/api/burial-applications/').data[0]
        self.assertEqual(row['cancellation_reason'], 'Family changed plans')
        self.assertFalse(row['can_cancel'])

    def test_cancellation_does_not_free_assigned_or_completed_burials(self):
        url = f'/api/burial-applications/{self.application.pk}/cancel/'
        for status in ['for_interview', 'slot_assigned', 'scheduled', 'completed', 'rejected']:
            self.application.status = status
            self.application.save()
            self.assertEqual(self.client.post(url, {'reason': 'Cancel'}).status_code, 400)
            self.application.refresh_from_db()
            self.assertEqual(self.application.status, status)
        self.assertFalse(StatusAuditLog.objects.filter(application=self.application).exists())

    def test_document_batch_failure_is_not_success_or_partial_update(self):
        self.application.status = 'action_required'
        self.application.save()
        url = f'/api/burial-applications/{self.application.pk}/upload-documents/'
        valid = SimpleUploadedFile('valid.pdf', b'%PDF fixture')
        invalid = SimpleUploadedFile('invalid.exe', b'bad')
        response = self.client.post(url, {'valid_id': valid, 'death_certificate': invalid}, format='multipart')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(BurialDocument.objects.filter(application=self.application).exists())
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'action_required')
        self.assertEqual(self.client.post(url, {}).status_code, 400)

    def test_corrected_documents_are_stored_and_return_to_review(self):
        self.application.status = 'action_required'
        self.application.save()
        url = f'/api/burial-applications/{self.application.pk}/upload-documents/'
        response = self.client.post(url, {'valid_id': SimpleUploadedFile('valid.pdf', b'%PDF fixture')}, format='multipart')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['uploaded'], ['valid_id'])
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, 'pending_review')
        self.assertEqual(self.application.documents.get().verification_status, 'pending_review')
        self.application.status = 'cancelled'
        self.application.save()
        self.assertEqual(self.client.post(url, {'valid_id': SimpleUploadedFile('valid.pdf', b'%PDF fixture')}, format='multipart').status_code, 400)
