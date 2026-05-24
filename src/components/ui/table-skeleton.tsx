import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  /** Number of rows to render. Default: 5 */
  rows?: number;
  /** Number of columns to render. Default: 5 */
  columns?: number;
  /** Column header labels (optional). Displays Skeleton bars when omitted. */
  headers?: string[];
}

/**
 * Shimmer / skeleton placeholder rendered while table data is loading.
 * Replaces spinner-only feedback to communicate the expected layout.
 */
export function TableSkeleton({ rows = 5, columns = 5, headers }: TableSkeletonProps) {
  const colCount = headers?.length ?? columns;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: colCount }).map((_, i) => (
            <TableHead key={i}>
              {headers?.[i] ?? <Skeleton className="h-4 w-20" />}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <TableRow key={rowIdx}>
            {Array.from({ length: colCount }).map((_, colIdx) => (
              <TableCell key={colIdx}>
                <Skeleton
                  className="h-4"
                  style={{
                    // Vary widths for visual realism
                    width: `${55 + ((rowIdx + colIdx) % 4) * 10}%`,
                  }}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
