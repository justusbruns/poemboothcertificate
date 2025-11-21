# Device Setup Tool - Usage Guide

## Quick Start

### Option 1: Run with Node.js (Development)

```bash
npm install
npm run build
npm start
```

### Option 2: Use Pre-built Windows Executable

Double-click `device-setup.exe` or run from command prompt:

```cmd
device-setup.exe
```

## Step-by-Step Process

### 1. Launch the Tool

When you start the tool, you'll see:

```
🏭 Poem Booth Device Setup - Certificate Generator

This tool generates X.509 certificates and registers devices in the database.
```

### 2. Enter Supabase Credentials

```
? Supabase URL: https://xtgxfighvyybzcxfimvs.supabase.co
? Service Role Key: ********************************
```

The tool will validate your connection to the database.

### 3. Select Device Information

```
? Asset Tag (e.g., PB-005): PB-005
? Select Hub: Amsterdam Hub (NL)
? Serial Number (optional): SN-2025-005
? Equipment Type: Poem Booth
```

### 4. Confirm Configuration

The tool will show a summary:

```
📋 Configuration Summary:
   Asset Tag:      PB-005
   Hub:            Amsterdam Hub
   Serial:         SN-2025-005
   Equipment Type: poem_booth

? Proceed with device registration? Yes
```

### 5. Certificate Generation

The tool will automatically:
- ✅ Validate prerequisites (OpenSSL)
- ✅ Check/generate Root CA
- ✅ Create equipment record in database
- ✅ Generate device certificate
- ✅ Pre-register device

### 6. Success!

You'll see:

```
✅ DEVICE SETUP COMPLETE!

📋 Device Details:
   Asset Tag:    PB-005
   Device ID:    550e8400-e29b-41d4-a716-446655440000
   Equipment ID: 5
   Hub ID:       a1b2c3d4-e5f6-7890-abcd-ef1234567890
   Serial:       SN-2025-005
   Status:       ready_to_deploy

📁 Certificate Files:
   Certificate:  device-certs/PB-005-cert.pem
   Private Key:  device-certs/PB-005-key.pem
   CA Cert:      ca/ca-cert.pem

📦 Next Steps:
   1. Copy certificate files to Electron app credentials folder
   2. Build Electron app with embedded credentials
   3. Ship device to hub
   4. Hub manager powers on and scans WiFi QR code
   5. Device auto-registers and starts operating
```

## Output Files

After successful registration, you'll find:

### Device-Specific Files

Located in `device-certs/` folder:
- `PB-005-cert.pem` - X.509 certificate (embed in Electron app)
- `PB-005-key.pem` - Private key (embed in Electron app)

### Root CA Files (First Run Only)

Located in `ca/` folder:
- `ca-cert.pem` - Root CA certificate (uploaded to database automatically)
- `ca-key.pem` - Root CA private key (⚠️ **KEEP SECURE**)
- `ca-password.txt` - CA password (⚠️ **KEEP SECURE**)

## Deploying to Kiosk Device

### 1. Copy Certificate Files

Copy the generated certificates to your Electron kiosk app:

```bash
# Example structure in Electron app
electron-kiosk-app/
├── credentials/
│   ├── device-cert.pem   # Copy from device-certs/PB-005-cert.pem
│   └── device-key.pem    # Copy from device-certs/PB-005-key.pem
```

### 2. Build Electron App

Build your Electron app with the embedded certificates:

```bash
cd electron-kiosk-app
npm run build
```

### 3. Ship to Hub

Transfer the built app to the kiosk device and ship to the hub location.

### 4. First Boot

When the hub manager receives the device:
1. Power on the device
2. Scan WiFi QR code to connect to network
3. Device automatically calls `/api/devices/register`
4. Device is activated and ready to use

## Troubleshooting

### Error: "OpenSSL not found"

**Solution**: Install OpenSSL on your system
- **Windows**: Download from https://slproweb.com/products/Win32OpenSSL.html
- **macOS**: `brew install openssl`
- **Linux**: `sudo apt-get install openssl`

### Error: "Failed to connect to Supabase"

**Causes**:
- Invalid Supabase URL
- Invalid service role key
- No internet connection
- Firewall blocking connection

**Solution**: Double-check credentials and network connection

### Error: "Asset tag already exists"

**Cause**: Device with this asset tag is already registered

**Solution**:
- Use a different asset tag (e.g., PB-006 instead of PB-005)
- Or delete the existing device from the database if this is intentional

### Error: "Hub not found"

**Cause**: The hub ID doesn't exist in the database

**Solution**:
- Verify the hub exists by checking the hub list
- Create the hub first using the admin interface

### Error: "Failed to upload CA"

**Cause**: CA already exists in database (this is usually okay)

**Solution**: This is typically a duplicate error and can be ignored - the tool will continue

## Security Best Practices

### Certificate Files
- ✅ Store device certificates securely during provisioning
- ✅ Embed in Electron app immediately
- ❌ Never commit to git
- ❌ Never share via insecure channels

### Root CA Files
- ✅ Backup CA files to secure vault (password manager, encrypted drive)
- ✅ Restrict access to CA password
- ✅ Keep CA private key offline when not in use
- ❌ Never expose CA private key
- ❌ Never commit to git

### Service Role Key
- ✅ Use only during device setup
- ✅ Store securely in password manager
- ❌ Never embed in production kiosk code
- ❌ Never commit to git

## Building the Executable

To rebuild the Windows executable:

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Package as Windows .exe
npm run package
```

The executable will be created at `dist/device-setup.exe` (~48 MB)

## Advanced Usage

### Command Line Arguments (Future Enhancement)

Currently, the tool is interactive only. To add command-line support, modify `src/index.ts` to check for CLI arguments before prompting.

Example future usage:
```bash
device-setup.exe --asset-tag PB-005 --hub-id <uuid> --serial SN-123
```

## Support

For issues or questions:
- Check the main README.md
- Review error messages carefully
- Ensure all prerequisites are met
- Contact the development team
