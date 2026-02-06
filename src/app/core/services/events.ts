import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

export interface GlobalEvent {
  id: string;
  season_id: string;
  event_type: 'city_purchased' | 'city_conquered' | 'country_conquered' | 'invasion_started';
  user_id: string;
  city_id?: string;
  country_id?: string;
  message: string;
  created_at: string;
  user?: {
    username: string;
    display_name: string;
  };
  city?: {
    name: string;
    country?: {
      name: string;
    };
  };
  country?: {
    name: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class EventsService {
  constructor(private supabase: SupabaseService) {}

  // Obtener eventos globales de la temporada
  getGlobalEvents(seasonId: string, limit: number = 50): Observable<GlobalEvent[]> {
    return from(
      this.supabase.client
        .from('global_events')
        .select(`
          *,
          user:profiles!global_events_user_id_fkey(username, display_name),
          city:cities(name, country:countries(name)),
          country:countries(name)
        `)
        .eq('season_id', seasonId)
        .order('created_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as GlobalEvent[];
      })
    );
  }

  // Suscribirse a eventos en tiempo real
  subscribeToEvents(seasonId: string, callback: (event: GlobalEvent) => void) {
    return this.supabase.client
      .channel('global_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'global_events',
          filter: `season_id=eq.${seasonId}`
        },
        (payload) => {
          callback(payload.new as GlobalEvent);
        }
      )
      .subscribe();
  }

  // Obtener emoji por tipo de evento
  getEventEmoji(eventType: string): string {
    const emojis: Record<string, string> = {
      'city_purchased': '💰',
      'city_conquered': '⚔️',
      'country_conquered': '🌍',
      'invasion_started': '🔴'
    };
    return emojis[eventType] || '📢';
  }

  // Obtener color por tipo de evento
  getEventColor(eventType: string): string {
    const colors: Record<string, string> = {
      'city_purchased': '#10b981',
      'city_conquered': '#ef4444',
      'country_conquered': '#8b5cf6',
      'invasion_started': '#f59e0b'
    };
    return colors[eventType] || '#6b7280';
  }
}