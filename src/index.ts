#!/usr/bin/env node

import inquirer from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import { CertificateGenerator } from './certificate-generator'
import { DeviceRegistrar } from './device-registrar'

interface Answers {
  supabaseUrl: string
  supabaseKey: string
  assetTag: string
  hubId?: string
  serial?: string
  equipmentType?: string
}

async function main() {
  console.log(chalk.bold.cyan('\n🏭 Poem Booth Device Setup - Certificate Generator\n'))
  console.log(chalk.gray('This tool generates X.509 certificates and registers devices in the database.\n'))

  try {
    // Step 1: Collect Supabase credentials
    const credentialAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'supabaseUrl',
        message: 'Supabase URL:',
        default: 'https://xtgxfighvyybzcxfimvs.supabase.co',
        validate: (input: string) => {
          if (!input.startsWith('http')) {
            return 'Please enter a valid URL'
          }
          return true
        }
      },
      {
        type: 'password',
        name: 'supabaseKey',
        message: 'Service Role Key:',
        mask: '*',
        validate: (input: string) => {
          if (!input || input.length < 20) {
            return 'Please enter a valid service role key'
          }
          return true
        }
      }
    ])

    // Validate connection
    const spinner = ora('Connecting to Supabase...').start()
    const registrar = new DeviceRegistrar(
      credentialAnswers.supabaseUrl,
      credentialAnswers.supabaseKey
    )

    try {
      await registrar.validateConnection()
      spinner.succeed('Connected to Supabase')
    } catch (error) {
      spinner.fail('Failed to connect to Supabase')
      throw error
    }

    // Fetch available hubs
    spinner.text = 'Fetching hubs...'
    spinner.start()
    const hubs = await registrar.fetchHubs()
    spinner.succeed(`Found ${hubs.length} hubs`)

    if (hubs.length === 0) {
      console.log(chalk.red('\n❌ No hubs found in database. Please create a hub first.'))
      process.exit(1)
    }

    // Step 2: Collect device information
    const deviceAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'assetTag',
        message: 'Asset Tag (e.g., PB-005):',
        validate: (input: string) => {
          if (!input || input.length < 3) {
            return 'Please enter a valid asset tag'
          }
          return true
        }
      },
      {
        type: 'list',
        name: 'hubId',
        message: 'Select Hub:',
        choices: hubs.map(hub => ({
          name: `${hub.name} (${hub.region_code})`,
          value: hub.id
        }))
      },
      {
        type: 'input',
        name: 'serial',
        message: 'Serial Number (optional):',
        default: ''
      },
      {
        type: 'list',
        name: 'equipmentType',
        message: 'Equipment Type:',
        choices: [
          { name: 'Poem Booth', value: 'poem_booth' },
          { name: 'Printer', value: 'printer' },
          { name: 'Other', value: 'other' }
        ],
        default: 'poem_booth'
      }
    ])

    const answers: Answers = { ...credentialAnswers, ...deviceAnswers }

    console.log(chalk.cyan('\n📋 Configuration Summary:'))
    console.log(chalk.gray(`   Asset Tag:      ${answers.assetTag}`))
    console.log(chalk.gray(`   Hub:            ${hubs.find(h => h.id === answers.hubId)?.name}`))
    console.log(chalk.gray(`   Serial:         ${answers.serial || 'N/A'}`))
    console.log(chalk.gray(`   Equipment Type: ${answers.equipmentType}`))

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with device registration?',
        default: true
      }
    ])

    if (!confirm) {
      console.log(chalk.yellow('\n❌ Registration cancelled.'))
      process.exit(0)
    }

    // Step 3: Generate certificates
    console.log(chalk.cyan('\n🔐 Generating certificates...\n'))

    const certGen = new CertificateGenerator()

    // Validate prerequisites
    spinner.text = 'Validating prerequisites...'
    spinner.start()
    await certGen.validatePrerequisites()
    spinner.succeed('Prerequisites validated')

    // Ensure CA exists
    spinner.text = 'Checking Root CA...'
    spinner.start()
    const { caCertContent, isNew } = await certGen.ensureCAExists()

    if (isNew) {
      spinner.succeed('Root CA generated')
      console.log(chalk.yellow('   ⚠️  New CA created - backup CA files securely!'))

      // Upload CA to database
      spinner.text = 'Uploading CA to database...'
      spinner.start()
      const caInfo = await certGen.getCAInfo()
      await registrar.uploadCAToDatabase(
        caCertContent,
        caInfo.fingerprint,
        caInfo.notBefore,
        caInfo.notAfter
      )
      spinner.succeed('CA uploaded to database')
    } else {
      spinner.succeed('Root CA found')
    }

    // Ensure equipment exists or create it
    spinner.text = 'Checking equipment record...'
    spinner.start()
    const deviceId = '' // Temporary, will be generated
    const equipmentId = await registrar.ensureEquipmentExists(
      {
        assetTag: answers.assetTag,
        hubId: answers.hubId!,
        serial: answers.serial || undefined,
        equipmentType: answers.equipmentType
      },
      deviceId
    )
    spinner.succeed(`Equipment record ready (ID: ${equipmentId})`)

    // Generate device certificate
    spinner.text = 'Generating device certificate...'
    spinner.start()
    const certInfo = await certGen.generateDeviceCertificate(
      answers.assetTag,
      answers.hubId!,
      equipmentId
    )
    spinner.succeed('Device certificate generated')

    // Pre-register device
    spinner.text = 'Pre-registering device in database...'
    spinner.start()
    await registrar.preRegisterDevice(
      {
        assetTag: answers.assetTag,
        hubId: answers.hubId!,
        serial: answers.serial || undefined,
        equipmentType: answers.equipmentType
      },
      certInfo
    )
    spinner.succeed('Device pre-registered')

    // Success summary
    console.log(chalk.green.bold('\n✅ DEVICE SETUP COMPLETE!\n'))
    console.log(chalk.cyan('📋 Device Details:'))
    console.log(chalk.gray(`   Asset Tag:    ${answers.assetTag}`))
    console.log(chalk.gray(`   Device ID:    ${certInfo.deviceId}`))
    console.log(chalk.gray(`   Equipment ID: ${certInfo.equipmentId}`))
    console.log(chalk.gray(`   Hub ID:       ${answers.hubId}`))
    console.log(chalk.gray(`   Serial:       ${answers.serial || 'N/A'}`))
    console.log(chalk.gray(`   Status:       ready_to_deploy`))

    console.log(chalk.cyan('\n📁 Certificate Files:'))
    console.log(chalk.gray(`   Certificate:  ${certInfo.certificatePath}`))
    console.log(chalk.gray(`   Private Key:  ${certInfo.privateKeyPath}`))
    console.log(chalk.gray(`   CA Cert:      ${certGen.getCAPath()}`))

    console.log(chalk.cyan('\n📦 Next Steps:'))
    console.log(chalk.gray('   1. Copy certificate files to Electron app credentials folder'))
    console.log(chalk.gray('   2. Build Electron app with embedded credentials'))
    console.log(chalk.gray('   3. Ship device to hub'))
    console.log(chalk.gray('   4. Hub manager powers on and scans WiFi QR code'))
    console.log(chalk.gray('   5. Device auto-registers and starts operating'))

    console.log(chalk.yellow('\n⚠️  SECURITY REMINDER:'))
    console.log(chalk.gray('   - Keep private key secure (treat like a password)'))
    console.log(chalk.gray('   - Do NOT commit certificates to git'))
    console.log(chalk.gray('   - Backup CA files in secure vault\n'))

  } catch (error) {
    console.log(chalk.red(`\n❌ Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`))
    process.exit(1)
  }
}

// Run the CLI
main()
