interface BillableDonutProps {
  billablePercent: number;
  billableHours: number;
  nonBillableHours: number;
  size?: number;
}

export default function BillableDonut({
  billablePercent,
  billableHours,
  nonBillableHours,
  size = 92,
}: BillableDonutProps) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const billableLen = (billablePercent / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#DEEBFF"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#0052CC"
            strokeWidth={stroke}
            strokeDasharray={`${billableLen} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-heading text-base font-bold text-text">{billablePercent}%</span>
        </div>
      </div>
      <div className="min-w-0 space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-primary" />
          <span className="text-muted">Billable</span>
          <span className="ml-auto font-semibold text-text">{billableHours.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-primary-soft" />
          <span className="text-muted">Non-billable</span>
          <span className="ml-auto font-semibold text-text">{nonBillableHours.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
