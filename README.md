# Poem Booth Certificate Generator

Simple CLI tool for registering Poem Booth devices with X.509 certificate generation.

## Features

- Generates X.509 certificates for device authentication
- Pre-registers devices in Supabase database
- Creates Root CA if needed (one-time setup)
- Links equipment records with device certificates
- Windows executable (.exe) for easy distribution

## Installation

### For Development

```bash
npm install
npm run dev
```

### Build Windows Executable

```bash
npm run build
npm run package
```

This creates `dist/device-setup.exe` (~40 MB)

## Usage

### Run the executable

```bash
./dist/device-setup.exe
```

### Follow the prompts

1. Enter Supabase URL
2. Enter Service Role Key
3. Enter Asset Tag (e.g., "PB-005")
4. Enter Hub ID (UUID)
5. Enter Serial Number (optional)

### Output

Certificate files will be saved to:
- `device-certs/[asset-tag]-cert.pem` - Device certificate
- `device-certs/[asset-tag]-key.pem` - Private key
- `ca/ca-cert.pem` - Root CA certificate (first run only)

## Requirements

- Node.js 18+ (for development)
- Network access to Supabase
- Windows OS (for running the .exe)

## Security Notes

- Service role key is only stored in memory during execution
- Certificate private keys are unencrypted (secure the device-certs folder)
- Root CA password is saved to `ca/ca-password.txt` for future certificate signing

## Troubleshooting

**Error: "Failed to connect to Supabase"**
- Check internet connection
- Verify Supabase URL and service role key
- Ensure service role key has database access permissions

**Error: "Asset tag already exists"**
- Device already registered
- Use a different asset tag or check database

**Error: "Hub not found"**
- Verify the hub UUID exists in database
- Check you copied the full UUID

## Files Generated

After successful registration, you'll find these files:

### Device-Specific Files (`device-certs/`)
- `[asset-tag]-cert.pem` - X.509 device certificate
- `[asset-tag]-key.pem` - Private key (unencrypted)

### Root CA Files (`ca/` - first run only)
- `ca-cert.pem` - Root CA certificate (automatically uploaded to database)
- `ca-key.pem` - Root CA private key (⚠️ **KEEP SECURE**)
- `ca-password.txt` - CA password (⚠️ **KEEP SECURE**)

## Next Steps After Registration

1. Copy certificate files to USB drive:
   ```
   cp device-certs/PB-005-cert.pem /path/to/usb/
   cp device-certs/PB-005-key.pem /path/to/usb/
   ```

2. Transfer to kiosk device (Electron app):
   ```
   electron-kiosk-app/
   └── credentials/
       ├── device-cert.pem
       └── device-key.pem
   ```

3. Build Electron app with embedded credentials
4. Ship device to hub
5. Hub manager powers on and scans WiFi QR code
6. Kiosk auto-registers via `/api/devices/register`

## Development

### Run in Development Mode

```bash
npm install
npm run dev
```

This uses `tsx` to run TypeScript directly without compilation.

### Build and Test

```bash
# Compile TypeScript
npm run build

# Run compiled version
npm start
```

### Package Windows Executable

```bash
npm run package
```

Creates `dist/device-setup.exe` (~48 MB)

## For Workshop Personnel

### Quick Reference Card

**Prerequisites:**
- Windows PC with this tool installed
- Internet connection
- Supabase credentials (get from admin)

**Steps:**
1. Double-click `device-setup.exe`
2. Enter Supabase URL and service role key
3. Enter asset tag (printed on device label)
4. Select hub from dropdown
5. Enter serial number if available
6. Confirm and wait for completion
7. Copy certificate files to USB drive
8. Transfer to Electron app credentials folder
9. Build and ship device

**Typical Time:** 2-3 minutes per device

## Architecture

This tool is part of the zero-touch provisioning system:

```
Workshop (This Tool)          Shipping          Hub Location
┌─────────────────┐                          ┌──────────────┐
│ 1. Generate     │                          │ 5. Power on  │
│    certificate  │                          │              │
│ 2. Pre-register │                          │ 6. Scan WiFi │
│    in database  │         ┌────────┐       │    QR code   │
│ 3. Embed in     │────────▶│ Device │──────▶│              │
│    Electron app │         └────────┘       │ 7. Auto-     │
│ 4. Ship         │                          │    register  │
└─────────────────┘                          │              │
                                             │ 8. Operate   │
                                             └──────────────┘
```

### Certificate-Based Authentication

- **X.509 certificates** embed device ID, equipment ID, and hub ID
- **No tokens or API keys** in kiosk production code
- **Row Level Security (RLS)** enforces database-level access control
- **Certificate revocation** supported via database table
