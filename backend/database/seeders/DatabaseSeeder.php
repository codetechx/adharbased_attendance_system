<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\User;
use App\Models\Vendor;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // ── Super Admin ───────────────────────────────────────────────────────
        User::updateOrCreate(
            ['email' => 'superadmin@ams.local'],
            [
                'name'      => 'Super Admin',
                'password'  => Hash::make('Admin@12345'),
                'role'      => User::ROLE_SUPER_ADMIN,
                'is_active' => true,
            ]
        );

        // ── Demo Company ──────────────────────────────────────────────────────
        $company = Company::updateOrCreate(
            ['code' => 'COMP-001'],
            [
                'name'           => 'Acme Manufacturing Ltd',
                'address'        => '123 Industrial Area, Phase 2',
                'city'           => 'Pune',
                'state'          => 'Maharashtra',
                'pin'            => '411001',
                'contact_person' => 'Rajesh Kumar',
                'contact_email'  => 'contact@acme.com',
                'contact_phone'  => '9876543210',
                'gst_number'     => '27AAAAA0000A1Z5',
                'status'         => 'active',
            ]
        );

        // Company Admin
        User::updateOrCreate(
            ['email' => 'company@ams.local'],
            [
                'name'       => 'Company Admin',
                'password'   => Hash::make('Admin@12345'),
                'role'       => User::ROLE_COMPANY_ADMIN,
                'company_id' => $company->id,
                'is_active'  => true,
            ]
        );

        // Gate User
        User::updateOrCreate(
            ['email' => 'gate@ams.local'],
            [
                'name'       => 'Gate Guard',
                'password'   => Hash::make('Admin@12345'),
                'role'       => User::ROLE_COMPANY_GATE,
                'company_id' => $company->id,
                'is_active'  => true,
            ]
        );

        // ── Demo Vendor ───────────────────────────────────────────────────────
        $vendor = Vendor::updateOrCreate(
            ['code' => 'VND-001'],
            [
                'name'           => 'Apex Labor Solutions Pvt Ltd',
                'address'        => '45 MG Road',
                'city'           => 'Mumbai',
                'state'          => 'Maharashtra',
                'pin'            => '400001',
                'contact_person' => 'Suresh Patel',
                'contact_email'  => 'contact@apex.com',
                'contact_phone'  => '9123456789',
                'status'         => 'active',
            ]
        );

        // Vendor Admin
        User::updateOrCreate(
            ['email' => 'vendor@ams.local'],
            [
                'name'       => 'Vendor Admin',
                'password'   => Hash::make('Admin@12345'),
                'role'       => User::ROLE_VENDOR_ADMIN,
                'vendor_id'  => $vendor->id,
                'is_active'  => true,
            ]
        );

        // ── Approve vendor for the demo company ───────────────────────────────
        \DB::table('company_vendors')->updateOrInsert(
            ['company_id' => $company->id, 'vendor_id' => $vendor->id],
            [
                'status'      => 'approved',
                'approved_at' => now(),
                'created_at'  => now(),
                'updated_at'  => now(),
            ]
        );

        $this->command->info('Seed complete.');
        $this->command->table(
            ['Role', 'Email', 'Password'],
            [
                ['Super Admin', 'superadmin@ams.local', 'Admin@12345'],
                ['Company Admin', 'company@ams.local', 'Admin@12345'],
                ['Gate User', 'gate@ams.local', 'Admin@12345'],
                ['Vendor Admin', 'vendor@ams.local', 'Admin@12345'],
            ]
        );
    }
}
