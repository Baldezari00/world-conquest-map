import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

export interface RankingEntry {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  total_cities: number;
  total_inhabitants: number;
  conquered_countries: number;
  rank?: number;
}

@Injectable({
  providedIn: 'root'
})
export class RankingService {
  constructor(private supabase: SupabaseService) {}

  // Top por habitantes
  getTopByInhabitants(limit: number = 100): Observable<RankingEntry[]> {
    return from(
      this.supabase.client
        .from('profiles')
        .select('id, username, display_name, avatar_url, total_cities, total_inhabitants, conquered_countries')
        .order('total_inhabitants', { ascending: false })
        .limit(limit)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data as RankingEntry[]).map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));
      })
    );
  }

  // Top por ciudades
  getTopByCities(limit: number = 100): Observable<RankingEntry[]> {
    return from(
      this.supabase.client
        .from('profiles')
        .select('id, username, display_name, avatar_url, total_cities, total_inhabitants, conquered_countries')
        .order('total_cities', { ascending: false })
        .limit(limit)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data as RankingEntry[]).map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));
      })
    );
  }

  // Top por países conquistados
  getTopByCountries(limit: number = 100): Observable<RankingEntry[]> {
    return from(
      this.supabase.client
        .from('profiles')
        .select('id, username, display_name, avatar_url, total_cities, total_inhabitants, conquered_countries')
        .order('conquered_countries', { ascending: false })
        .order('total_inhabitants', { ascending: false })
        .limit(limit)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return (response.data as RankingEntry[]).map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));
      })
    );
  }

  // Obtener posición de un usuario específico
  async getUserRank(userId: string): Promise<{ byInhabitants: number; byCities: number; byCountries: number }> {
    // Ranking por habitantes
    const { data: inhabitantsData } = await this.supabase.client
      .from('profiles')
      .select('id, total_inhabitants')
      .order('total_inhabitants', { ascending: false });

    const byInhabitants = (inhabitantsData?.findIndex(p => p.id === userId) ?? -1) + 1;

    // Ranking por ciudades
    const { data: citiesData } = await this.supabase.client
      .from('profiles')
      .select('id, total_cities')
      .order('total_cities', { ascending: false });

    const byCities = (citiesData?.findIndex(p => p.id === userId) ?? -1) + 1;

    // Ranking por países
    const { data: countriesData } = await this.supabase.client
      .from('profiles')
      .select('id, conquered_countries')
      .order('conquered_countries', { ascending: false });

    const byCountries = (countriesData?.findIndex(p => p.id === userId) ?? -1) + 1;

    return { byInhabitants, byCities, byCountries };
  }
}