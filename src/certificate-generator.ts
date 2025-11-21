import crypto from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

export interface CertificateInfo {
  deviceId: string
  equipmentId: number
  fingerprint: string
  certificatePath: string
  privateKeyPath: string
}

export class CertificateGenerator {
  private caDir: string
  private certsDir: string
  private caCertPath: string
  private caKeyPath: string
  private caPasswordPath: string

  constructor(baseDir: string = process.cwd()) {
    this.caDir = path.join(baseDir, 'ca')
    this.certsDir = path.join(baseDir, 'device-certs')
    this.caCertPath = path.join(this.caDir, 'ca-cert.pem')
    this.caKeyPath = path.join(this.caDir, 'ca-key.pem')
    this.caPasswordPath = path.join(this.caDir, 'ca-password.txt')
  }

  async validatePrerequisites(): Promise<void> {
    // Check OpenSSL
    try {
      await execAsync('openssl version')
    } catch (error) {
      throw new Error('OpenSSL not found. Please install OpenSSL.')
    }

    // Create directories
    await fs.mkdir(this.caDir, { recursive: true })
    await fs.mkdir(this.certsDir, { recursive: true })
  }

  async ensureCAExists(): Promise<{ caCertContent: string; isNew: boolean }> {
    try {
      await fs.access(this.caCertPath)
      const caCertContent = await fs.readFile(this.caCertPath, 'utf-8')
      return { caCertContent, isNew: false }
    } catch {
      // Generate new CA
      const caPassword = crypto.randomBytes(32).toString('hex')

      // Generate CA private key (4096-bit RSA, AES-256 encrypted)
      await execAsync(`openssl genrsa -out ${this.caKeyPath} -aes256 -passout pass:${caPassword} 4096`)

      // Generate CA certificate (valid 10 years)
      await execAsync(`openssl req -new -x509 -days 3650 \
        -key ${this.caKeyPath} \
        -out ${this.caCertPath} \
        -passin pass:${caPassword} \
        -subj "/C=NL/ST=Noord-Holland/L=Amsterdam/O=Poem Booth/CN=Poem Booth Root CA"`)

      // Save CA password securely
      await fs.writeFile(this.caPasswordPath, caPassword, { mode: 0o600 })

      const caCertContent = await fs.readFile(this.caCertPath, 'utf-8')
      return { caCertContent, isNew: true }
    }
  }

  async generateDeviceCertificate(
    assetTag: string,
    hubId: string,
    equipmentId: number
  ): Promise<CertificateInfo> {
    // Generate unique device ID
    const deviceId = crypto.randomUUID()

    // Certificate file paths
    const privateKeyPath = path.join(this.certsDir, `${assetTag}-key.pem`)
    const certPath = path.join(this.certsDir, `${assetTag}-cert.pem`)
    const csrPath = path.join(this.certsDir, `${assetTag}.csr`)
    const configPath = path.join(this.certsDir, `${assetTag}-openssl.cnf`)

    // Create OpenSSL config with Subject Alternative Names
    const opensslConfig = `
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = NL
ST = Noord-Holland
L = Amsterdam
O = Poem Booth
CN = ${deviceId}

[v3_req]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = clientAuth
subjectAltName = @alt_names

[alt_names]
URI.1 = urn:device:${deviceId}
URI.2 = urn:equipment:${equipmentId}
URI.3 = urn:hub:${hubId}
DNS.1 = ${assetTag}.booth.internal
`

    await fs.writeFile(configPath, opensslConfig.trim())

    // Generate device private key (2048-bit RSA, no password for embedded use)
    await execAsync(`openssl genrsa -out ${privateKeyPath} 2048`)

    // Generate Certificate Signing Request
    await execAsync(`openssl req -new -key ${privateKeyPath} -out ${csrPath} -config ${configPath}`)

    // Sign certificate with CA (valid 10 years)
    const caPassword = await fs.readFile(this.caPasswordPath, 'utf-8')
    await execAsync(`openssl x509 -req -in ${csrPath} \
      -CA ${this.caCertPath} \
      -CAkey ${this.caKeyPath} \
      -CAcreateserial \
      -out ${certPath} \
      -days 3650 \
      -sha256 \
      -extensions v3_req \
      -extfile ${configPath} \
      -passin pass:${caPassword.trim()}`)

    // Calculate certificate fingerprint
    const certContent = await fs.readFile(certPath, 'utf-8')
    const fingerprint = crypto.createHash('sha256').update(certContent).digest('hex')

    // Cleanup temporary files
    await fs.unlink(csrPath).catch(() => {})
    await fs.unlink(configPath).catch(() => {})

    return {
      deviceId,
      equipmentId,
      fingerprint,
      certificatePath: certPath,
      privateKeyPath
    }
  }

  async getCAInfo(): Promise<{ fingerprint: string; notBefore: Date; notAfter: Date }> {
    const caCertContent = await fs.readFile(this.caCertPath, 'utf-8')
    const fingerprint = crypto.createHash('sha256').update(caCertContent).digest('hex')

    // Parse certificate for validity dates
    const { stdout: certInfo } = await execAsync(`openssl x509 -in ${this.caCertPath} -noout -dates`)
    const notBeforeStr = certInfo.match(/notBefore=(.+)/)?.[1]
    const notAfterStr = certInfo.match(/notAfter=(.+)/)?.[1]

    return {
      fingerprint,
      notBefore: new Date(notBeforeStr!),
      notAfter: new Date(notAfterStr!)
    }
  }

  getCAPath(): string {
    return this.caCertPath
  }

  async readCACertificate(): Promise<string> {
    return await fs.readFile(this.caCertPath, 'utf-8')
  }
}
