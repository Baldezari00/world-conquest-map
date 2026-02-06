import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { InvasionService, Invasion } from '../../../core/services/invasion.service';
import { InvasionResolverService } from '../../../core/services/invasion-resolver.service'; // NUEVO
import { SeasonService } from '../../../core/services/season.service';

@Component({
  selector: 'app-invasions-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invasions-panel.html',
  styleUrls: ['./invasions-panel.scss']
})
export class InvasionsPanelComponent implements OnInit, OnDestroy {
  invasions: Invasion[] = [];
  userId: string = '';
  seasonId: string = '';
  loading = true;
  private refreshInterval: any;

  constructor(
    private supabase: SupabaseService,
    private invasionService: InvasionService,
    private invasionResolver: InvasionResolverService, // NUEVO
    private seasonService: SeasonService,
    private router: Router
  ) {}

  async ngOnInit() {
    const user = this.supabase.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.userId = user.id;
    await this.loadActiveSeason();
    this.loadInvasions();

    // Auto-refresh cada 5 segundos (más frecuente en testing)
    this.refreshInterval = setInterval(() => {
      this.loadInvasions();
    }, 5000);
  }

  ngOnDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  async loadActiveSeason() {
    this.seasonService.getActiveSeason().subscribe(season => {
      if (season) {
        this.seasonId = season.id;
        this.loadInvasions();
      }
    });
  }

  loadInvasions() {
    if (!this.seasonId) return;

    this.invasionService.getActiveInvasions(this.userId, this.seasonId).subscribe({
      next: (invasions) => {
        this.invasions = invasions;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando invasiones:', error);
        this.loading = false;
      }
    });
  }

  getTimeRemaining(endsAt: string): string {
    const end = new Date(endsAt);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) {
      return '⏰ Listo para resolver';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // Si son menos de 60 segundos, mostrar countdown de segundos
    if (hours === 0 && minutes === 0) {
      return `${seconds}s`;
    }

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }

    return `${minutes}m ${seconds}s`;
  }

  isReadyToResolve(endsAt: string): boolean {
    return new Date(endsAt) <= new Date();
  }

  isAttacker(invasion: Invasion): boolean {
    return invasion.attacker_id === this.userId;
  }

  async cancelInvasion(invasionId: string) {
    const confirmed = confirm('¿Cancelar esta invasión?\n\nSolo puedes hacerlo en las primeras 2 horas.');
    if (!confirmed) return;

    try {
      await this.invasionService.cancelInvasion(invasionId, this.userId);
      alert('✅ Invasión cancelada');
      this.loadInvasions();
    } catch (error: any) {
      alert(`❌ ${error.message}`);
    }
  }

  async resolveInvasion(invasionId: string) {
    try {
      const result = await this.invasionService.resolveInvasion(invasionId);
      
      if (result.success) {
        alert('🎉 ¡Victoria! Has conquistado la ciudad');
      } else {
        alert('😔 Derrota. El defensor mantuvo su ciudad.');
      }
      
      this.loadInvasions();
    } catch (error: any) {
      alert(`❌ ${error.message}`);
    }
  }

  /**
   * BOTÓN DE TESTING: Fuerza la resolución de TODAS las invasiones
   * (útil durante desarrollo)
   */
  async forceResolveAll() {
    const confirmed = confirm(
      '⚡ MODO TESTING\n\n' +
      'Esto resolverá TODAS las invasiones pendientes inmediatamente.\n\n' +
      '¿Continuar?'
    );
    
    if (!confirmed) return;

    try {
      await this.invasionResolver.forceResolveAll();
      
      // Esperar 1 segundo y recargar
      setTimeout(() => {
        this.loadInvasions();
      }, 1000);

    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    }
  }

  goToMap() {
    this.router.navigate(['/map']);
  }
}