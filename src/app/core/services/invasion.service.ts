import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Observable, from, map } from 'rxjs';

export interface Invasion {
  id: string;
  city_id: string;
  season_id: string;
  attacker_id: string;
  defender_id: string;
  attacker_power: number;
  defender_power: number;
  status: 'pending' | 'won_attacker' | 'won_defender' | 'cancelled';
  started_at: string;
  ends_at: string;
  resolved_at?: string;
  conquest_index: number;
  city?: any;
  attacker?: any;
  defender?: any;
}

@Injectable({
  providedIn: 'root'
})
export class InvasionService {
  constructor(private supabase: SupabaseService) {}

  // Calcular índice de conquista
  calculateConquestIndex(
    attackerPower: number,
    defenderPower: number,
    cityLevel: number,
    hasShield: boolean
  ): number {
    if (hasShield) return 0;

    let index = (attackerPower / defenderPower) * 100;
    index -= (cityLevel * 5);
    index -= 10;
    
    return Math.max(0, Math.min(100, index));
  }

  // Iniciar invasión
  async startInvasion(
    cityId: string,
    seasonId: string,
    attackerId: string,
    defenderId: string
  ): Promise<any> {
    console.log('🎯 [START INVASION] Iniciando invasión...');
    
    // 1. Obtener poder del atacante
    const { data: attackerCities } = await this.supabase.client
      .from('city_ownership')
      .select('virtual_inhabitants')
      .eq('owner_id', attackerId)
      .eq('season_id', seasonId);

    const attackerPower = attackerCities?.reduce((sum, city) => sum + city.virtual_inhabitants, 0) || 0;
    console.log('⚔️ Poder del atacante:', attackerPower);

    if (attackerPower === 0) {
      throw new Error('Necesitas al menos una ciudad para atacar');
    }

    // 2. Obtener datos de la ciudad objetivo
    const { data: targetCity, error: cityError } = await this.supabase.client
      .from('city_ownership')
      .select('*, city:cities(*)')
      .eq('city_id', cityId)
      .eq('season_id', seasonId)
      .single();

    if (cityError || !targetCity) {
      throw new Error('Ciudad no encontrada');
    }

    console.log('🏙️ Ciudad objetivo:', targetCity.city.name);
    console.log('🛡️ Poder del defensor:', targetCity.virtual_inhabitants);

    // 3. Verificar escudo
    if (targetCity.shield_until && new Date(targetCity.shield_until) > new Date()) {
      throw new Error('Esta ciudad tiene escudo activo');
    }

    const defenderPower = targetCity.virtual_inhabitants;
    const conquestIndex = this.calculateConquestIndex(
      attackerPower,
      defenderPower,
      targetCity.city_level,
      false
    );

    console.log('📊 Índice de conquista calculado:', conquestIndex.toFixed(1) + '%');

    // 4. Crear invasión
    const endsAt = new Date();
    endsAt.setSeconds(endsAt.getSeconds() + 24); // 24 segundos para testing

    const { data: invasion, error: invasionError } = await this.supabase.client
      .from('invasions')
      .insert({
        city_id: cityId,
        season_id: seasonId,
        attacker_id: attackerId,
        defender_id: defenderId,
        attacker_power: attackerPower,
        defender_power: defenderPower,
        status: 'pending',
        ends_at: endsAt.toISOString(),
        conquest_index: conquestIndex
      })
      .select()
      .single();

    if (invasionError) throw invasionError;

    console.log('✅ Invasión creada:', invasion.id);

    // 5. Evento global
    await this.supabase.client
      .from('global_events')
      .insert({
        season_id: seasonId,
        event_type: 'invasion_started',
        user_id: attackerId,
        city_id: cityId,
        message: `inició invasión sobre ${targetCity.city.name}`
      });

    return invasion;
  }

  // Resolver invasión
  async resolveInvasion(invasionId: string): Promise<any> {
    console.log('🎲 [RESOLVE INVASION] Resolviendo invasión:', invasionId);

    const { data: invasion, error: invasionError } = await this.supabase.client
      .from('invasions')
      .select('*')
      .eq('id', invasionId)
      .single();

    if (invasionError) {
      console.error('❌ Error obteniendo invasión:', invasionError);
      throw invasionError;
    }

    if (!invasion || invasion.status !== 'pending') {
      console.warn('⚠️ Invasión no válida o ya resuelta:', invasion?.status);
      throw new Error('Invasión no válida');
    }

    console.log('📋 Datos de invasión:');
    console.log('  - Atacante:', invasion.attacker_id);
    console.log('  - Defensor:', invasion.defender_id);
    console.log('  - Ciudad:', invasion.city_id);
    console.log('  - Índice de conquista:', invasion.conquest_index + '%');

    // Determinar ganador
    const random = Math.random() * 100;
    const attackerWins = random < invasion.conquest_index;

    console.log('🎰 Random generado:', random.toFixed(2));
    console.log('🏆 Ganador:', attackerWins ? 'ATACANTE' : 'DEFENSOR');

    const newStatus = attackerWins ? 'won_attacker' : 'won_defender';

    // Actualizar estado de invasión
    const { error: updateError } = await this.supabase.client
      .from('invasions')
      .update({
        status: newStatus,
        resolved_at: new Date().toISOString()
      })
      .eq('id', invasionId);

    if (updateError) {
      console.error('❌ Error actualizando invasión:', updateError);
      throw updateError;
    }

    console.log('✅ Estado de invasión actualizado a:', newStatus);

    if (attackerWins) {
      console.log('🚀 Atacante ganó - Transfiriendo ciudad...');
      
      try {
        await this.transferCity(
          invasion.city_id,
          invasion.season_id,
          invasion.attacker_id,
          invasion.defender_id
        );
        console.log('✅ Ciudad transferida exitosamente');
      } catch (transferError: any) {
        console.error('❌ ERROR CRÍTICO en transferCity:', transferError);
        console.error('Stack:', transferError.stack);
        throw transferError;
      }

      // Evento global
      await this.supabase.client
        .from('global_events')
        .insert({
          season_id: invasion.season_id,
          event_type: 'city_conquered',
          user_id: invasion.attacker_id,
          city_id: invasion.city_id,
          message: `conquistó una ciudad`
        });

      console.log('✅ Evento global creado');

    } else {
      console.log('😔 Defensor ganó - Penalizando atacante...');
      
      const penalty = Math.floor(invasion.attacker_power * 0.1);
      console.log('💀 Penalización:', penalty, 'habitantes');

      const { error: penaltyError } = await this.supabase.client.rpc('decrement_user_stats', {
        user_id: invasion.attacker_id,
        inhabitants: penalty
      });

      if (penaltyError) {
        console.error('❌ Error aplicando penalización:', penaltyError);
      } else {
        console.log('✅ Penalización aplicada');
      }
    }

    console.log('🎉 Invasión resuelta completamente');
    return { success: attackerWins, invasion };
  }

  // Transferir ciudad
  async transferCity(
    cityId: string,
    seasonId: string,
    newOwnerId: string,
    oldOwnerId: string
  ): Promise<void> {
    console.log('🔄 [TRANSFER CITY] Iniciando transferencia...');
    console.log('  - Ciudad ID:', cityId);
    console.log('  - Season ID:', seasonId);
    console.log('  - Nuevo dueño:', newOwnerId);
    console.log('  - Viejo dueño:', oldOwnerId);

    // 1. Obtener ownership actual
    const { data: currentOwnership, error: ownershipError } = await this.supabase.client
      .from('city_ownership')
      .select('*')
      .eq('city_id', cityId)
      .eq('season_id', seasonId)
      .single();

    if (ownershipError) {
      console.error('❌ Error obteniendo ownership:', ownershipError);
      throw ownershipError;
    }

    if (!currentOwnership) {
      console.error('❌ No se encontró ownership');
      throw new Error('Ciudad no encontrada');
    }

    console.log('📦 Ownership actual:', currentOwnership);

    const inhabitants = currentOwnership.virtual_inhabitants;
    const bonus = Math.floor(inhabitants * 0.2);
    const newInhabitants = inhabitants + bonus;

    console.log('👥 Habitantes actuales:', inhabitants);
    console.log('🎁 Bonus (20%):', bonus);
    console.log('✨ Nuevos habitantes:', newInhabitants);

    // 2. IMPORTANTE: Verificar usuario actual antes del UPDATE
    const currentUser = this.supabase.getCurrentUser();
    console.log('🔐 Usuario actual en sesión:', currentUser?.id);

    if (!currentUser) {
      throw new Error('No hay usuario autenticado');
    }

    // 3. Actualizar ownership
    // NOTA: El problema de RLS puede estar aquí
    console.log('📝 Intentando UPDATE en city_ownership...');
    
    const { data: updateResult, error: updateError } = await this.supabase.client
      .from('city_ownership')
      .update({
        owner_id: newOwnerId,
        virtual_inhabitants: newInhabitants,
        shield_until: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        last_attacked_at: new Date().toISOString()
      })
      .eq('city_id', cityId)
      .eq('season_id', seasonId)
      .select();

    if (updateError) {
      console.error('❌ ERROR en UPDATE city_ownership:');
      console.error('Código:', updateError.code);
      console.error('Mensaje:', updateError.message);
      console.error('Detalles:', updateError.details);
      console.error('Hint:', updateError.hint);
      
      // Si es error 403, es problema de RLS
      if (updateError.message.includes('policy')) {
        console.error('🚨 PROBLEMA DE RLS DETECTADO');
        console.error('La política de seguridad no permite este UPDATE');
        console.error('Necesitas revisar las políticas RLS en Supabase');
      }
      
      throw updateError;
    }

    console.log('✅ UPDATE exitoso:', updateResult);

    // 4. Actualizar stats del ganador
    console.log('📊 Actualizando stats del ganador...');
    
    const { error: incrementError } = await this.supabase.client.rpc('increment_user_stats', {
      user_id: newOwnerId,
      cities: 1,
      inhabitants: newInhabitants
    });

    if (incrementError) {
      console.error('❌ Error incrementando stats:', incrementError);
      throw incrementError;
    }

    console.log('✅ Stats del ganador actualizados');

    // 5. Actualizar stats del perdedor
    console.log('📊 Actualizando stats del perdedor...');
    
    const { error: decrementError } = await this.supabase.client.rpc('decrement_user_stats', {
      user_id: oldOwnerId,
      cities: 1,
      inhabitants: inhabitants
    });

    if (decrementError) {
      console.error('❌ Error decrementando stats:', decrementError);
      throw decrementError;
    }

    console.log('✅ Stats del perdedor actualizados');
    console.log('🎉 Transferencia completada exitosamente');
  }

  // Obtener invasiones activas
  getActiveInvasions(userId: string, seasonId: string): Observable<Invasion[]> {
    return from(
      this.supabase.client
        .from('invasions')
        .select(`
          *,
          city:cities(*),
          attacker:profiles!invasions_attacker_id_fkey(*),
          defender:profiles!invasions_defender_id_fkey(*)
        `)
        .eq('season_id', seasonId)
        .or(`attacker_id.eq.${userId},defender_id.eq.${userId}`)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ).pipe(
      map(response => {
        if (response.error) throw response.error;
        return response.data as Invasion[];
      })
    );
  }

  // Cancelar invasión
  async cancelInvasion(invasionId: string, userId: string): Promise<void> {
    const { data: invasion } = await this.supabase.client
      .from('invasions')
      .select('*')
      .eq('id', invasionId)
      .eq('attacker_id', userId)
      .single();

    if (!invasion) throw new Error('Invasión no encontrada');

    const startedAt = new Date(invasion.started_at);
    const now = new Date();
    const hoursDiff = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);

    if (hoursDiff > 2) {
      throw new Error('Solo puedes cancelar en las primeras 2 horas');
    }

    await this.supabase.client
      .from('invasions')
      .update({ status: 'cancelled' })
      .eq('id', invasionId);
  }
}