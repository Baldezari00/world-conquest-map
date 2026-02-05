import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

export interface City {
  id: string;
  name: string;
  country_id: string;
  latitude: number;
  longitude: number;
  real_population: number;
  base_price: number;
  city_type: 'capital' | 'port' | 'normal' | 'island';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  country?: Country;
  ownership?: CityOwnership[];  // CAMBIO: ahora es un array
}

export interface Country {
  id: string;
  name: string;
  code: string;
  continent: string;
  total_cities: number;
}

export interface CityOwnership {
  id: string;
  city_id: string;
  season_id: string;
  owner_id: string;
  virtual_inhabitants: number;
  city_level: number;
  purchased_at: string;
  shield_until?: string;
  owner?: UserProfile;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  total_cities: number;
  total_inhabitants: number;
  conquered_countries: number;
}

@Injectable({
  providedIn: 'root'
})
export class CityService {
  constructor(private supabase: SupabaseService) {}

  // Obtener todas las ciudades con ownership
  getCities(): Observable<City[]> {
    return from(
      this.supabase.client
        .from('cities')
        .select(`
          *,
          country:countries(*),
          ownership:city_ownership(
            *,
            owner:profiles(*)
          )
        `)
        .order('name')
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as City[];
      })
    );
  }

  // Obtener ciudades disponibles (sin dueño en temporada activa)
  getAvailableCities(seasonId: string): Observable<City[]> {
    return from(
      this.supabase.client
        .from('cities')
        .select(`
          *,
          country:countries(*),
          ownership:city_ownership!left(*)
        `)
        .is('ownership.season_id', null)
        .or(`ownership.season_id.neq.${seasonId}`)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as City[];
      })
    );
  }

  // Obtener ciudades de un usuario
  getUserCities(userId: string, seasonId: string): Observable<City[]> {
    return from(
      this.supabase.client
        .from('city_ownership')
        .select(`
          *,
          city:cities(
            *,
            country:countries(*)
          )
        `)
        .eq('owner_id', userId)
        .eq('season_id', seasonId)
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data.map((ownership: any) => ({
          ...ownership.city,
          ownership: [ownership]  // CAMBIO: convertir a array
        })) as City[];
      })
    );
  }

  // Comprar ciudad
  async purchaseCity(cityId: string, seasonId: string, userId: string): Promise<any> {
    // 1. Obtener datos de la ciudad
    const { data: city, error: cityError } = await this.supabase.client
      .from('cities')
      .select('*')
      .eq('id', cityId)
      .single();

    if (cityError) throw cityError;

    // 2. Verificar que no esté comprada
    const { data: existing } = await this.supabase.client
      .from('city_ownership')
      .select('*')
      .eq('city_id', cityId)
      .eq('season_id', seasonId)
      .single();

    if (existing) {
      throw new Error('Esta ciudad ya tiene dueño');
    }

    // 3. Crear ownership
    const virtualInhabitants = Math.floor(city.real_population * 0.1); // 10% de la población real

    const { data: ownership, error: ownershipError } = await this.supabase.client
      .from('city_ownership')
      .insert({
        city_id: cityId,
        season_id: seasonId,
        owner_id: userId,
        virtual_inhabitants: virtualInhabitants,
        city_level: 1
      })
      .select()
      .single();

    if (ownershipError) throw ownershipError;

    // 4. Actualizar estadísticas del usuario
    await this.supabase.client.rpc('increment_user_stats', {
      user_id: userId,
      cities: 1,
      inhabitants: virtualInhabitants
    });

    // 5. Crear evento global
    await this.supabase.client
      .from('global_events')
      .insert({
        season_id: seasonId,
        event_type: 'city_purchased',
        user_id: userId,
        city_id: cityId,
        message: `compró ${city.name}`
      });

    return ownership;
  }

  // Obtener ciudad por ID
  getCityById(cityId: string): Observable<City> {
    return from(
      this.supabase.client
        .from('cities')
        .select(`
          *,
          country:countries(*),
          ownership:city_ownership(
            *,
            owner:profiles(*)
          )
        `)
        .eq('id', cityId)
        .single()
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as City;
      })
    );
  }
}