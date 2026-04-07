"""
Seed the Government Archive database with pre-dumped citizen accounts and admin users.
Run: python manage.py seed_db
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
import datetime


CITIZENS = [
    {
        'aadhaar_number': '234567890123',
        'name': 'Priya Sharma',
        'password': 'Priya@2024Secure',
        'date_of_birth': '1990-03-15',
        'address': '45, MG Road, Bengaluru, Karnataka 560001',
        'phone': '9876543210',
        'email': 'priya.sharma@email.com',
    },
    {
        'aadhaar_number': '345678901234',
        'name': 'Rahul Mehta',
        'password': 'Rahul@2024Secure',
        'date_of_birth': '1985-07-22',
        'address': '12, Connaught Place, New Delhi 110001',
        'phone': '9876543211',
        'email': 'rahul.mehta@email.com',
    },
    {
        'aadhaar_number': '456789012345',
        'name': 'Anjali Nair',
        'password': 'Anjali@2024Secure',
        'date_of_birth': '1995-11-08',
        'address': '78, Marine Drive, Mumbai, Maharashtra 400020',
        'phone': '9876543212',
        'email': 'anjali.nair@email.com',
    },
    {
        'aadhaar_number': '567890123456',
        'name': 'Vikram Singh',
        'password': 'Vikram@2024Secure',
        'date_of_birth': '1988-02-28',
        'address': '33, Park Street, Kolkata, West Bengal 700016',
        'phone': '9876543213',
        'email': 'vikram.singh@email.com',
    },
    {
        'aadhaar_number': '678901234567',
        'name': 'Deepa Krishnan',
        'password': 'Deepa@2024Secure',
        'date_of_birth': '1992-09-14',
        'address': '22, Anna Nagar, Chennai, Tamil Nadu 600040',
        'phone': '9876543214',
        'email': 'deepa.krishnan@email.com',
    },
]

ADMINS = [
    {
        'username': 'admin',
        'name': 'Chief Verification Officer',
        'department': 'National Identity Authority',
        'password': 'Admin@Gov2024',
    },
    {
        'username': 'reviewer1',
        'name': 'Suresh Babu',
        'department': 'KYC Review Division',
        'password': 'Reviewer@2024',
    },
]


class Command(BaseCommand):
    help = 'Seed the database with pre-defined citizen and admin accounts'

    def handle(self, *args, **options):
        from gov_project.apps.accounts.models import CitizenUser, AdminUser

        self.stdout.write('\n=== Seeding Government Archive Database ===\n')

        # Seed citizens
        for data in CITIZENS:
            citizen, created = CitizenUser.objects.get_or_create(
                aadhaar_number=data['aadhaar_number'],
                defaults={
                    'name': data['name'],
                    'date_of_birth': data.get('date_of_birth'),
                    'address': data.get('address', ''),
                    'phone': data.get('phone', ''),
                    'email': data.get('email', ''),
                }
            )
            if created:
                citizen.set_password(data['password'])
                citizen.save()
                self.stdout.write(self.style.SUCCESS(
                    f'  ✓ Citizen created: {data["name"]} ({data["aadhaar_number"]}) — password: {data["password"]}'
                ))
            else:
                self.stdout.write(f'  · Citizen exists: {data["name"]} ({data["aadhaar_number"]})')

        self.stdout.write('')

        # Seed admins
        for data in ADMINS:
            admin, created = AdminUser.objects.get_or_create(
                username=data['username'],
                defaults={
                    'name': data['name'],
                    'department': data.get('department', ''),
                }
            )
            if created:
                admin.set_password(data['password'])
                admin.save()
                self.stdout.write(self.style.SUCCESS(
                    f'  ✓ Admin created: {data["name"]} (username: {data["username"]}) — password: {data["password"]}'
                ))
            else:
                self.stdout.write(f'  · Admin exists: {data["name"]} ({data["username"]})')

        self.stdout.write('\n' + self.style.SUCCESS('=== Seeding complete! ==='))
        self.stdout.write('\nCitizen login credentials:')
        for d in CITIZENS:
            self.stdout.write(f'  Aadhaar: {d["aadhaar_number"]}  |  Password: {d["password"]}')
        self.stdout.write('\nAdmin login credentials:')
        for d in ADMINS:
            self.stdout.write(f'  Username: {d["username"]}  |  Password: {d["password"]}')
        self.stdout.write('')
