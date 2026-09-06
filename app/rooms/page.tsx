import type { Metadata } from 'next';
import { IncidentRoomsDirectory } from '@/components/IncidentRoomsDirectory';

export const metadata: Metadata = {
  title: 'Incident War Rooms & History | EchoOps',
  description: 'Directory of all active and historical incident war rooms with complete conversation transcripts and instant rejoin options.',
};

export default function RoomsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 selection:bg-indigo-500/30">
      <IncidentRoomsDirectory />
    </div>
  );
}
