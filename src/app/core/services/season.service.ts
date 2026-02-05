import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

export interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  winner_id?: string;
  prize_amount?: number;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class SeasonService {
  constructor(private supabase: SupabaseService) {}

  getActiveSeason(): Observable<Season | null> {
    return from(
      this.supabase.client
        .from('seasons')
        .select('*')
        .eq('is_active', true)
        .single()
    ).pipe(
      map(response => {
        if (response.error) return null;
        return response.data as Season;
      })
    );
  }

  getAllSeasons(): Observable<Season[]> {
    return from(
      this.supabase.client
        .from('seasons')
        .select('*')
        .order('created_at', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Season[];
      })
    );
  }
}