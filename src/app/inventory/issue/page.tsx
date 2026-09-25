import { redirect } from 'next/navigation';

// /inventory/issue on its own just forwards to the requisition screen.
export default function IssueHome() {
  redirect('/inventory/issue/requisition');
}
