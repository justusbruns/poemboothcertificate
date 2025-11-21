import { createClient, SupabaseClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import { CertificateInfo } from './certificate-generator'

export interface DeviceSetupOptions {
  assetTag: string
  hubId: string
  serial?: string
  equipmentType?: string
}

export class DeviceRegistrar {
  private supabase: SupabaseClient

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  }

  async validateConnection(): Promise<void> {
    // Test connection by querying a simple table
    const { error } = await this.supabase.from('hubs').select('id').limit(1)
    if (error) {
      throw new Error(`Failed to connect to Supabase: ${error.message}`)
    }
  }

  async fetchHubs(): Promise<Array<{ id: string; name: string; region_code: string }>> {
    const { data, error } = await this.supabase
      .from('hubs')
      .select('id, name, region_code')
      .order('name')

    if (error) {
      throw new Error(`Failed to fetch hubs: ${error.message}`)
    }

    return data || []
  }

  async ensureEquipmentExists(options: DeviceSetupOptions, deviceId: string): Promise<number> {
    // Check if equipment already exists
    const { data: existing } = await this.supabase
      .from('equipment_inventory')
      .select('id, asset_tag, hub_id')
      .eq('asset_tag', options.assetTag)
      .eq('hub_id', options.hubId)
      .single()

    if (existing) {
      return existing.id
    }

    // Create new equipment record
    const { data: created, error } = await this.supabase
      .from('equipment_inventory')
      .insert({
        asset_tag: options.assetTag,
        hub_id: options.hubId,
        equipment_type: options.equipmentType || 'poem_booth',
        device_serial: options.serial,
        status: 'pending_activation'
      })
      .select('id')
      .single()

    if (error) {
      throw new Error(`Failed to create equipment: ${error.message}`)
    }

    return created.id
  }

  async uploadCAToDatabase(
    caCertContent: string,
    fingerprint: string,
    notBefore: Date,
    notAfter: Date
  ): Promise<void> {
    const { error } = await this.supabase
      .from('trusted_device_cas')
      .insert({
        name: 'Poem Booth Root CA',
        certificate: caCertContent,
        fingerprint,
        valid_from: notBefore.toISOString(),
        valid_until: notAfter.toISOString(),
        is_active: true
      })

    // Ignore duplicate error (code 23505)
    if (error && error.code !== '23505') {
      throw new Error(`Failed to upload CA: ${error.message}`)
    }
  }

  async preRegisterDevice(
    options: DeviceSetupOptions,
    certInfo: CertificateInfo
  ): Promise<void> {
    const certificateContent = await fs.readFile(certInfo.certificatePath, 'utf-8')

    // Insert into registered_devices
    const { error: deviceError } = await this.supabase
      .from('registered_devices')
      .insert({
        device_id: certInfo.deviceId,
        equipment_id: certInfo.equipmentId,
        certificate: certificateContent,
        fingerprint: certInfo.fingerprint,
        serial_number: options.serial,
        status: 'ready_to_deploy'
      })

    if (deviceError) {
      throw new Error(`Failed to register device: ${deviceError.message}`)
    }

    // Update equipment with device references
    const { error: equipmentError } = await this.supabase
      .from('equipment_inventory')
      .update({
        device_id: certInfo.deviceId,
        device_certificate_fingerprint: certInfo.fingerprint
      })
      .eq('id', certInfo.equipmentId)

    if (equipmentError) {
      throw new Error(`Failed to update equipment: ${equipmentError.message}`)
    }
  }
}
