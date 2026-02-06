import { Injectable } from '@angular/core';
import { InvasionService } from './invasion.service';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class InvasionResolverService {
  private intervalId: any;
  private isRunning = false;

  constructor(
    private invasionService: InvasionService,
    private supabase: SupabaseService
  ) {}

  /**
   * Inicia el auto-resolver de invasiones
   * Verifica cada 10 segundos si hay invasiones que deban resolverse
   */
  startAutoResolver() {
    if (this.isRunning) {
      console.log('⚠️ Auto-resolver ya está corriendo');
      return;
    }

    console.log('✅ Auto-resolver de invasiones iniciado');
    this.isRunning = true;

    // Ejecutar inmediatamente
    this.checkAndResolveInvasions();

    // Luego cada 10 segundos
    this.intervalId = setInterval(() => {
      this.checkAndResolveInvasions();
    }, 10000); // 10 segundos
  }

  /**
   * Detiene el auto-resolver
   */
  stopAutoResolver() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('🛑 Auto-resolver detenido');
    }
  }

  /**
   * Verifica y resuelve invasiones que ya terminaron
   */
  private async checkAndResolveInvasions() {
    try {
      // Obtener invasiones pendientes cuyo tiempo ya expiró
      const { data: expiredInvasions, error } = await this.supabase.client
        .from('invasions')
        .select('*')
        .eq('status', 'pending')
        .lt('ends_at', new Date().toISOString()); // ends_at < now

      if (error) {
        console.error('Error obteniendo invasiones expiradas:', error);
        return;
      }

      if (!expiredInvasions || expiredInvasions.length === 0) {
        return; // No hay invasiones para resolver
      }

      console.log(`🎲 Resolviendo ${expiredInvasions.length} invasiones expiradas...`);

      // Resolver cada invasión
      for (const invasion of expiredInvasions) {
        try {
          await this.invasionService.resolveInvasion(invasion.id);
          console.log(`✅ Invasión ${invasion.id} resuelta`);
        } catch (error: any) {
          console.error(`❌ Error resolviendo invasión ${invasion.id}:`, error.message);
        }
      }

      if (expiredInvasions.length > 0) {
        console.log(`🎉 ${expiredInvasions.length} invasiones resueltas automáticamente`);
      }

    } catch (error) {
      console.error('Error en checkAndResolveInvasions:', error);
    }
  }

  /**
   * Fuerza la resolución inmediata de todas las invasiones pendientes
   * (útil para testing)
   */
  async forceResolveAll() {
    try {
      const { data: allPending, error } = await this.supabase.client
        .from('invasions')
        .select('*')
        .eq('status', 'pending');

      if (error || !allPending) {
        console.error('Error obteniendo invasiones:', error);
        return;
      }

      console.log(`⚡ FORZANDO resolución de ${allPending.length} invasiones...`);

      for (const invasion of allPending) {
        try {
          await this.invasionService.resolveInvasion(invasion.id);
          console.log(`✅ Invasión ${invasion.id} resuelta (forzada)`);
        } catch (error: any) {
          console.error(`❌ Error:`, error.message);
        }
      }

      alert(`✅ ${allPending.length} invasiones resueltas manualmente`);

    } catch (error) {
      console.error('Error en forceResolveAll:', error);
    }
  }
}