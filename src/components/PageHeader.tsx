/**
 * The in-content page header: title, optional subtitle, optional actions.
 *
 * Rebuilt on the token layer (previously Astryx Heading/Text/stacks).
 * Geometry is pinned to what Astryx rendered — 29px/36px title at regular
 * weight, 14px/20px subtitle, 2px between them, 32px below the block — so
 * nothing moves. The colors land on the canonical palette the Astryx theme
 * always declared as its intent (#111111 / #6B6B6B) instead of the
 * blue-tinted greys its neutral theme actually derived.
 */
export default function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-[29px] font-normal leading-9 text-foreground">{title}</h1>
        {subtitle && <p className="text-sm leading-5 text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-3">{action}</div>}
    </div>
  );
}
