/**
 * Inline stroke icons. They inherit colour from `currentColor` and size from
 * the className, so the same component works in a tinted chip or in body text.
 */
function Icon({ className = 'size-5', children }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function CalendarIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Icon>
  );
}

export function ClockIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </Icon>
  );
}

export function CheckCircleIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5.5" />
    </Icon>
  );
}

export function PlusIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function MailIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </Icon>
  );
}

export function SparkleIcon(props) {
  return (
    <Icon {...props}>
      <path d="M11 3.5l1.7 4.3 4.3 1.7-4.3 1.7L11 15.5 9.3 11.2 5 9.5l4.3-1.7z" />
      <path d="M17.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </Icon>
  );
}

export function RefreshIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </Icon>
  );
}

export function SunIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
    </Icon>
  );
}

export function MoonIcon(props) {
  return (
    <Icon {...props}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </Icon>
  );
}

export function SignOutIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5M21 12H9" />
    </Icon>
  );
}

export function VideoIcon(props) {
  return (
    <Icon {...props}>
      <path d="m23 7-6 5 6 5z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </Icon>
  );
}

export function FileIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

export function CloudIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 20H7a5 5 0 0 1 0-10 6.5 6.5 0 0 1 12.6 2A4 4 0 0 1 18 20z" />
    </Icon>
  );
}

export function CloudRainIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 17H8a4.5 4.5 0 0 1 0-9 6 6 0 0 1 11.5 2A3.5 3.5 0 0 1 18 17z" />
      <path d="M8.5 19.5 7 22M12.5 19.5 11 22M16.5 19.5 15 22" />
    </Icon>
  );
}

export function CloudSnowIcon(props) {
  return (
    <Icon {...props}>
      <path d="M18 17H8a4.5 4.5 0 0 1 0-9 6 6 0 0 1 11.5 2A3.5 3.5 0 0 1 18 17z" />
      <path d="M9 20h.01M12 22h.01M15 20h.01" />
    </Icon>
  );
}

export function BoltIcon(props) {
  return (
    <Icon {...props}>
      <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
    </Icon>
  );
}

export function CloudSunIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
      <path d="M18 21H9a4 4 0 0 1 0-8 5 5 0 0 1 9.3-1.3A3.5 3.5 0 0 1 18 21z" />
    </Icon>
  );
}

export function WindIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 8h11a3 3 0 1 0-3-3M3 16h9a3 3 0 1 1-3 3M3 12h17" />
    </Icon>
  );
}

export function DropletIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3s5.5 6.1 5.5 10a5.5 5.5 0 0 1-11 0C6.5 9.1 12 3 12 3z" />
    </Icon>
  );
}

export function DeadlineIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9.5V13l2.5 1.5M9 2.5h6" />
    </Icon>
  );
}

export function ActivityIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 12h3.5l2.5-6 3.5 12 2.5-6H21" />
    </Icon>
  );
}

export function RunIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="14" cy="4.5" r="2" />
      <path d="M8.5 21 11 13l3 2 1.5 6M11 13 8 16M14 15l4.5-2 2 3.5" />
    </Icon>
  );
}

export function BikeIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="6" cy="17" r="3" />
      <circle cx="18" cy="17" r="3" />
      <path d="M6 17 10.5 8h4L18 17M10.5 8 12 17M12.5 8l-3 5h7" />
    </Icon>
  );
}

export function BookIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 5h9.5A2.5 2.5 0 0 1 17 7.5V20H7.5A2.5 2.5 0 0 0 5 22.5z" />
      <path d="M5 5A2.5 2.5 0 0 1 7.5 2.5H17" />
      <path d="M9 8.5h5.5" />
    </Icon>
  );
}

export function DroneIcon(props) {
  return (
    <Icon {...props}>
      <rect x="9" y="10" width="6" height="4" rx="1" />
      <path d="M12 10V8M10 12H7M14 12h3M9 12 5.5 8.5M15 12l3.5-3.5M9 12 5.5 15.5M15 12l3.5 3.5" />
      <circle cx="5.5" cy="8.5" r="1.5" />
      <circle cx="18.5" cy="8.5" r="1.5" />
      <circle cx="5.5" cy="15.5" r="1.5" />
      <circle cx="18.5" cy="15.5" r="1.5" />
    </Icon>
  );
}

export function DumbbellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 8v8M18 8v8M4 10v4M20 10v4M6 12h12" />
    </Icon>
  );
}

export function HomeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </Icon>
  );
}

export function BriefcaseIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
    </Icon>
  );
}

export function NavigationIcon(props) {
  return (
    <Icon {...props}>
      <path d="m4 12 15-8-8 15-1.5-5.5z" />
    </Icon>
  );
}

export function GearIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
    </Icon>
  );
}

export function AlertIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 4.5 21 20H3z" />
      <path d="M12 10v4M12 17h.01" />
    </Icon>
  );
}

export function DollarIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3v18M16 8.5c0-1.7-1.8-3-4-3s-4 1.3-4 3 1.8 2.5 4 3 4 1.3 4 3-1.8 3-4 3-4-1.3-4-3" />
    </Icon>
  );
}

export function LayoutIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </Icon>
  );
}

export function GripIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.25" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function ChevronUpIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 14 6-6 6 6" />
    </Icon>
  );
}

export function ChevronDownIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 10 6 6 6-6" />
    </Icon>
  );
}

export function ShieldIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function BellIcon(props) {
  return (
    <Icon {...props}>
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function VolumeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 9v6h3.5L14 19V5L8.5 9H5z" />
      <path d="M17 9.5a4 4 0 0 1 0 5" />
      <path d="M19.2 7.5a6.5 6.5 0 0 1 0 9" />
    </Icon>
  );
}

export function VolumeOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 9v6h3.5L14 19V5L8.5 9H5z" />
      <path d="m16 10 5 5M21 10l-5 5" />
    </Icon>
  );
}

export function GlobeIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 4.5 9A14 14 0 0 1 12 21a14 14 0 0 1-4.5-9A14 14 0 0 1 12 3z" />
    </Icon>
  );
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9 7V5h6v2M8 7l.8 13h6.4L16 7" />
    </Icon>
  );
}

export function ChartIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16l4-5 3 3 5-7" />
    </Icon>
  );
}

export function PackageIcon(props) {
  return (
    <Icon {...props}>
      <path d="M3 8.5 12 3l9 5.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M12 3v18M3.2 8.6 12 14l8.8-5.4" />
    </Icon>
  );
}

export function NutritionIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 11h16v1a8 8 0 0 1-16 0z" />
      <path d="M8 11V6.5a2.5 2.5 0 0 1 5 0V11" />
      <path d="M16.5 4v7" />
    </Icon>
  );
}

export function BarcodeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 6v12M7 6v12M9 6v12M12 6v12M15 6v12M18 6v12M20 6v12" />
    </Icon>
  );
}

export function CameraIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </Icon>
  );
}
