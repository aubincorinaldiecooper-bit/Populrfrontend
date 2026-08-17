/**
 * The header's icon-control skin — Inbox, the bell, and whatever global
 * control joins them later. One definition so the corner stays uniform.
 * Its own module (not exported from a component file) so Fast Refresh
 * keeps working in the components that use it.
 */
export const headerIconButton = `relative flex h-10 w-10 items-center justify-center rounded-full
  text-sidebar-muted-foreground transition-colors hover:bg-sidebar-muted
  hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-chartreuse`;
