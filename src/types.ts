export type PlayerId = 'bob' | 'mike';
export const PLAYERS: PlayerId[] = ['bob', 'mike'];

export interface Note { author: PlayerId | null; text: string; date: string | null }

export interface Session {
  id: string;
  date: string | null;
  bob: number;
  mike: number;
  /** null = the bonus scheme wasn't running yet (a "-" in the old sheet) */
  bonusBob: number | null;
  bonusMike: number | null;
  isVoid?: boolean;
  notes: Note[];
}

export type Format =
  | { type: 'lost' }
  | { type: 'league'; sessions: number; win: number; draw: number }
  | { type: 'race'; raceTo: number };

export interface Tournament {
  id: string;
  name: string;
  year: string;
  format: Format;
  /** Only for tournaments whose results can't be computed from sessions */
  winner?: PlayerId;
  bonusValue: number;
  photo?: string;
  notes: string[];
  sessions: Session[];
}

export interface BonusRule { id: string; text: string; points: number; note?: string }
export interface Decree { id: string; text: string }
export interface RecordRow { id: string; label: string; bob: string; mike: string }
export interface Award { id: string; title: string; holder: PlayerId }
export interface Photo { id: string; src: string; caption: string }
export interface PlantBoyEvent { id: string; period: string; text: string }

export interface SnookerDoc {
  schema: 1;
  players: Record<PlayerId, { name: string; nick: string; portrait: string }>;
  championship: { target: number; note: string };
  tournaments: Tournament[];
  bonusRules: BonusRule[];
  decrees: Decree[];
  plantBoy: {
    definition: string;
    ranks: string[];
    holders: Record<PlayerId, string | null>;
    history: PlantBoyEvent[];
  };
  records: RecordRow[];
  awards: Award[];
  gallery: Photo[];
}
