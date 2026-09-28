import { Button, Card, Field, Input, Notice, Screen, TopBar } from './ui'
import type { EmailSettings, LicenseDefaults } from '../lib/storage'
import type { TransporterProfile } from '../types'

interface Props {
  transporter: TransporterProfile
  licenses: LicenseDefaults
  email: EmailSettings
  hasOrder: boolean
  onTransporter: (t: Partial<TransporterProfile>) => void
  onLicenses: (l: Partial<LicenseDefaults>) => void
  onEmail: (e: Partial<EmailSettings>) => void
  onReset: () => void
  onBack: () => void
}

export function SettingsScreen({ transporter, licenses, email, hasOrder, onTransporter, onLicenses, onEmail, onReset, onBack }: Props) {
  const T = (key: keyof TransporterProfile, label: string, extra?: Record<string, unknown>) => (
    <Field label={label}>
      <Input value={transporter[key]} onChange={(e) => onTransporter({ [key]: e.target.value })} {...extra} />
    </Field>
  )

  return (
    <Screen
      footer={
        <Button block onClick={onBack}>
          Done
        </Button>
      }
    >
      <TopBar title="Settings" subtitle="Saved on this device only" onBack={onBack} />

      <Card className="p-4 space-y-3">
        <h2 className="text-subhead">Origin licenses</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cultivation">
            <Input value={licenses.cultivation} onChange={(e) => onLicenses({ cultivation: e.target.value.toUpperCase() })} autoCapitalize="characters" />
          </Field>
          <Field label="Manufacturing">
            <Input value={licenses.manufacturing} onChange={(e) => onLicenses({ manufacturing: e.target.value.toUpperCase() })} autoCapitalize="characters" />
          </Field>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-subhead">Transporter & driver</h2>
        <p className="text-xs text-gray-500">Copied onto every transfer. Matches the fields on the Metrc manifest.</p>
        <div className="grid grid-cols-2 gap-3">
          {T('transporterLicense', 'Transporter license', { autoCapitalize: 'characters', placeholder: 'TRA000033' })}
          {T('phone', 'Phone for questions', { inputMode: 'tel', placeholder: '3146272579' })}
        </div>
        {T('driverName', 'Driver name')}
        <div className="grid grid-cols-2 gap-3">
          {T('driverOccupationalLicense', 'Agent / employee ID', { autoCapitalize: 'characters', placeholder: 'AGT000000' })}
          {T('driverLicense', "Driver's license #", { autoCapitalize: 'characters' })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {T('vehicleMake', 'Vehicle make', { placeholder: 'Ford' })}
          {T('vehicleModel', 'Vehicle model', { placeholder: 'T250' })}
          {T('licensePlate', 'License plate', { autoCapitalize: 'characters' })}
          {T('registration', 'Registration / unit', { placeholder: 'Van 1' })}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="text-subhead">Email export</h2>
        <p className="text-xs text-gray-500">Where finished transfer files go by default. The access code is set by whoever runs the server (MANIFEST_ACCESS_CODE).</p>
        <Field label="Default recipient">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="name@company.com"
            value={email.to}
            onChange={(e) => onEmail({ to: e.target.value })}
          />
        </Field>
        <Field label="Access code">
          <Input type="password" autoComplete="off" autoCapitalize="none" value={email.accessCode} onChange={(e) => onEmail({ accessCode: e.target.value })} />
        </Field>
      </Card>

      {hasOrder && (
        <Card className="p-4 space-y-3">
          <h2 className="text-subhead">Current order</h2>
          <Notice tone="amber">Clearing removes the loaded pick list and every scan on this device.</Notice>
          <Button block variant="danger" onClick={onReset}>
            Clear current order
          </Button>
        </Card>
      )}
    </Screen>
  )
}
