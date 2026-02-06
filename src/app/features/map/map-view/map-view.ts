import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { trigger, transition, style, animate } from '@angular/animations';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CityService, City } from '../../../core/services/city.service';
import { SeasonService, Season } from '../../../core/services/season.service';
import { InvasionService } from '../../../core/services/invasion.service';
import { InvasionResolverService } from '../../../core/services/invasion-resolver.service';
import { EventsFeedComponent } from '../../../shared/components/events-feed/events-feed';

import * as L from 'leaflet';

// Interface para notificaciones
interface Notification {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  details?: string;
  timestamp: Date;
}

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule, EventsFeedComponent],
  templateUrl: './map-view.html',
  styleUrls: ['./map-view.scss'],
  animations: [
    trigger('slideIn', [
      transition(':enter', [
        style({ transform: 'translateX(400px)', opacity: 0 }),
        animate('400ms cubic-bezier(0.68, -0.55, 0.265, 1.55)', 
          style({ transform: 'translateX(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('300ms ease-out', 
          style({ transform: 'translateX(400px)', opacity: 0 }))
      ])
    ])
  ]
})
export class MapViewComponent implements OnInit, OnDestroy, AfterViewInit {
  username: string = '';
  userId: string = '';
  map: any;
  cities: City[] = [];
  activeSeason: Season | null = null;
  userCities: City[] = [];
  
  totalCities: number = 0;
  totalInhabitants: number = 0;
  conqueredCountries: number = 0;

  // Auto-refresh del mapa
  private refreshInterval: any;
  private cityMarkers: Map<string, L.CircleMarker> = new Map();

  // Sistema de notificaciones
  notifications: Notification[] = [];
  private notificationIdCounter = 0;
  private invasionCheckInterval: any;
  private processedInvasionIds = new Set<string>();

  constructor(
    private supabase: SupabaseService,
    private cityService: CityService,
    private seasonService: SeasonService,
    private invasionService: InvasionService,
    private invasionResolver: InvasionResolverService,
    private router: Router
  ) {}

  async ngOnInit() {
    const user = this.supabase.getCurrentUser();
    if (!user) {
      this.router.navigate(['/login']);
      return;
    }

    this.userId = user.id;
    await this.loadUserProfile();
    await this.loadActiveSeason();
    this.setupGlobalFunctions();

    // Iniciar sistemas
    this.invasionResolver.startAutoResolver();
    console.log('🎲 Sistema de auto-resolución de invasiones activado');

    this.startAutoRefresh();
    this.startInvasionMonitoring();
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.initMap();
      this.loadCities();
    }, 100);
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }

    this.invasionResolver.stopAutoResolver();
    
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      console.log('🛑 Auto-refresh detenido');
    }

    if (this.invasionCheckInterval) {
      clearInterval(this.invasionCheckInterval);
      console.log('🛑 Monitoreo de invasiones detenido');
    }
  }

  // ============================================
  // SISTEMA DE NOTIFICACIONES
  // ============================================

  private showNotification(
    type: 'success' | 'danger' | 'warning' | 'info',
    title: string,
    message: string,
    details?: string,
    duration: number = 8000
  ): void {
    const notification: Notification = {
      id: `notif-${this.notificationIdCounter++}-${Date.now()}`,
      type,
      title,
      message,
      details,
      timestamp: new Date()
    };

    this.notifications.push(notification);

    // Auto-dismiss
    setTimeout(() => {
      this.dismissNotification(notification.id);
    }, duration);

    console.log('📢 Notificación:', notification);
  }

  dismissNotification(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
  }

  clearAllNotifications(): void {
    this.notifications = [];
  }

  // ============================================
  // MONITOREO DE INVASIONES
  // ============================================

  private startInvasionMonitoring(): void {
    this.invasionCheckInterval = setInterval(async () => {
      if (!this.activeSeason) return;

      try {
        const { data: invasions, error } = await this.supabase.client
          .from('invasions')
          .select(`
            *,
            city:cities(name),
            attacker:profiles!invasions_attacker_id_fkey(username),
            defender:profiles!invasions_defender_id_fkey(username)
          `)
          .eq('season_id', this.activeSeason.id)
          .or(`attacker_id.eq.${this.userId},defender_id.eq.${this.userId}`)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) throw error;

        invasions?.forEach(invasion => {
          this.processInvasionNotification(invasion);
        });

      } catch (error) {
        console.error('Error monitoreando invasiones:', error);
      }
    }, 3000); // Cada 3 segundos

    console.log('👁️ Monitoreo de invasiones iniciado');
  }

  private processInvasionNotification(invasion: any): void {
    const invasionKey = `${invasion.id}-${invasion.status}`;
    
    // Evitar notificaciones duplicadas
    if (this.processedInvasionIds.has(invasionKey)) return;
    this.processedInvasionIds.add(invasionKey);

    const isAttacker = invasion.attacker_id === this.userId;
    const isDefender = invasion.defender_id === this.userId;

    // Solo notificar si la invasión es reciente (últimos 10 segundos)
    const createdAt = new Date(invasion.created_at || invasion.resolved_at);
    const now = new Date();
    const diffSeconds = (now.getTime() - createdAt.getTime()) / 1000;
    
    if (diffSeconds > 10) return; // Ignorar invasiones viejas

    // Invasión iniciada (solo defensor)
    if (invasion.status === 'pending' && isDefender) {
      const timeRemaining = this.getTimeRemaining(invasion.ends_at);
      
      this.showNotification(
        'danger',
        '⚔️ ¡ESTÁS BAJO ATAQUE!',
        `${invasion.attacker.username} está invadiendo ${invasion.city.name}`,
        `Probabilidad: ${invasion.conquest_index.toFixed(1)}% • Termina en ${timeRemaining}`,
        10000
      );
    }

    // Atacante ganó
    if (invasion.status === 'won_attacker') {
      if (isAttacker) {
        this.showNotification(
          'success',
          '🎉 ¡VICTORIA!',
          `Has conquistado ${invasion.city.name}`,
          `+20% bonus de habitantes • Escudo de 48h activado`,
          12000
        );
      } else if (isDefender) {
        this.showNotification(
          'danger',
          '💔 Ciudad Perdida',
          `${invasion.attacker.username} conquistó ${invasion.city.name}`,
          `Has perdido la ciudad y sus habitantes`,
          12000
        );
      }
    }

    // Defensor ganó
    if (invasion.status === 'won_defender') {
      if (isDefender) {
        this.showNotification(
          'success',
          '🛡️ ¡DEFENSA EXITOSA!',
          `Has defendido ${invasion.city.name} con éxito`,
          `${invasion.attacker.username} fue repelido`,
          12000
        );
      } else if (isAttacker) {
        this.showNotification(
          'warning',
          '😔 Invasión Fallida',
          `No pudiste conquistar ${invasion.city.name}`,
          `Perdiste 10% de tus habitantes totales`,
          12000
        );
      }
    }
  }

  private getTimeRemaining(endsAt: string): string {
    const now = new Date();
    const end = new Date(endsAt);
    const diffMs = end.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Terminando...';
    
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // ============================================
  // AUTO-REFRESH DEL MAPA
  // ============================================

  private startAutoRefresh() {
    this.refreshInterval = setInterval(async () => {
      console.log('🔄 Auto-refresh: Actualizando datos...');
      await this.loadUserProfile();
      await this.loadUserCities();
      await this.refreshMapData();
    }, 5000);

    console.log('✅ Auto-refresh iniciado (cada 5 segundos)');
  }

  private async refreshMapData() {
    if (!this.map) return;

    try {
      const { data: updatedCities, error } = await this.supabase.client
        .from('cities')
        .select(`
          *,
          country:countries(*),
          ownership:city_ownership(
            *,
            owner:profiles(*)
          )
        `)
        .eq('ownership.season_id', this.activeSeason?.id || '');

      if (error) {
        console.error('Error actualizando datos:', error);
        return;
      }

      this.cities = updatedCities as City[];
      this.updateCityMarkers();

    } catch (error) {
      console.error('Error en refreshMapData:', error);
    }
  }

  private updateCityMarkers() {
    this.cities.forEach(city => {
      const hasOwnership = city.ownership && Array.isArray(city.ownership) && city.ownership.length > 0;
      const isOwned = hasOwnership ? true : false;
      const isOwnedByUser = hasOwnership && city.ownership![0].owner_id === this.userId ? true : false;

      let color = '#3388ff';
      if (isOwnedByUser) {
        color = '#22c55e';
      } else if (isOwned) {
        color = '#ef4444';
      }

      const marker = this.cityMarkers.get(city.id);
      if (marker) {
        marker.setStyle({ fillColor: color });
        marker.setPopupContent(this.createPopupContent(city, isOwned, isOwnedByUser));
      }
    });
  }

  // ============================================
  // MÉTODOS EXISTENTES (sin cambios significativos)
  // ============================================

  async loadUserProfile() {
    const { data } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', this.userId)
      .single();

    if (data) {
      this.username = data.username || data.display_name || 'Conquistador';
      this.totalCities = data.total_cities || 0;
      this.totalInhabitants = data.total_inhabitants || 0;
      this.conqueredCountries = data.conquered_countries || 0;
    }
  }

  async loadActiveSeason() {
    this.seasonService.getActiveSeason().subscribe(season => {
      this.activeSeason = season;
      if (season) {
        this.loadUserCities();
      }
    });
  }

  async loadCities() {
    this.cityService.getCities().subscribe(cities => {
      this.cities = cities;
      if (this.map) {
        this.addCitiesToMap();
      }
    });
  }

  async loadUserCities() {
    if (!this.activeSeason) return;
    this.cityService.getUserCities(this.userId, this.activeSeason.id).subscribe(cities => {
      this.userCities = cities;
    });
  }

  initMap() {
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('Map element not found');
      return;
    }

    this.map = L.map('map', {
      center: [20, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18,
      minZoom: 2
    }).addTo(this.map);

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize(true);
      }
    }, 250);
  }

  addCitiesToMap() {
    if (!this.map) return;

    this.cityMarkers.clear();

    this.cities.forEach(city => {
      const hasOwnership = city.ownership && Array.isArray(city.ownership) && city.ownership.length > 0;
      const isOwned = hasOwnership ? true : false;
      const isOwnedByUser = hasOwnership && city.ownership![0].owner_id === this.userId ? true : false;

      let color = '#3388ff';
      if (isOwnedByUser) {
        color = '#22c55e';
      } else if (isOwned) {
        color = '#ef4444';
      }

      const size = this.getCitySize(city.rarity);

      const marker = L.circleMarker([city.latitude, city.longitude], {
        radius: size,
        fillColor: color,
        color: '#fff',
        weight: 2,
        fillOpacity: 0.9
      }).addTo(this.map);

      marker.bindPopup(this.createPopupContent(city, isOwned, isOwnedByUser), {
        maxWidth: 300,
        className: 'city-popup-container'
      });

      this.cityMarkers.set(city.id, marker);
    });

    console.log(`Total ciudades en mapa: ${this.cities.length}`);
  }

  getCitySize(rarity: string): number {
    const sizes: Record<string, number> = {
      'legendary': 12,
      'epic': 10,
      'rare': 8,
      'common': 6
    };
    return sizes[rarity] || 6;
  }

  createPopupContent(city: City, isOwned: boolean, isOwnedByUser: boolean): string {
    // ... código existente del popup (sin cambios) ...
    const rarityEmoji: Record<string, string> = {
      'legendary': '🟡',
      'epic': '🟣',
      'rare': '🔵',
      'common': '⚪'
    };

    const typeEmoji: Record<string, string> = {
      'capital': '👑',
      'port': '⚓',
      'island': '🏝️',
      'normal': '🏙️'
    };

    let content = `
      <div style="padding: 12px; min-width: 240px;">
        <h3 style="margin: 0 0 12px 0; color: #667eea; font-size: 1.2rem; display: flex; align-items: center; gap: 6px;">
          ${typeEmoji[city.city_type]} ${city.name}
        </h3>
        
        <div style="margin-bottom: 12px; background: #f8f9fa; padding: 10px; border-radius: 6px;">
          <p style="margin: 4px 0; font-size: 0.9rem;">
            <strong>🌍 País:</strong> ${city.country?.name || 'Desconocido'}
          </p>
          <p style="margin: 4px 0; font-size: 0.9rem;">
            <strong>💎 Rareza:</strong> ${rarityEmoji[city.rarity]} ${city.rarity.toUpperCase()}
          </p>
          <p style="margin: 4px 0; font-size: 0.9rem;">
            <strong>👥 Población Real:</strong> ${city.real_population.toLocaleString()}
          </p>
        </div>
    `;

    if (!isOwned) {
      const virtualInhabitants = Math.floor(city.real_population * 0.1);
      content += `
        <div style="background: #ecfdf5; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 2px solid #10b981;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #059669; font-size: 1rem;">
            🟢 CIUDAD DISPONIBLE
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>💰 Precio:</strong> $${city.base_price.toFixed(2)} USD
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>👥 Habitantes que obtendrás:</strong> ${virtualInhabitants.toLocaleString()}
          </p>
        </div>
        <button 
          style="
            width: 100%; 
            padding: 12px; 
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer; 
            font-weight: 700;
            font-size: 1.05rem;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            transition: transform 0.2s, box-shadow 0.2s;
          "
          onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(16, 185, 129, 0.4)'"
          onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'"
          onclick="window.purchaseCity('${city.id}')">
          💰 COMPRAR CIUDAD
        </button>
      `;
    } else if (isOwnedByUser && city.ownership && city.ownership[0]) {
      const ownership = city.ownership[0];
      const hasShield = ownership.shield_until && new Date(ownership.shield_until) > new Date();
      
      content += `
        <div style="background: #ecfdf5; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 2px solid #10b981;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #059669; font-size: 1rem;">
            ✅ ESTA ES TU CIUDAD
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>👥 Habitantes:</strong> ${ownership.virtual_inhabitants.toLocaleString()}
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #047857;">
            <strong>⭐ Nivel:</strong> ${ownership.city_level}
          </p>
          ${hasShield ? `
            <p style="margin: 6px 0; font-size: 0.9rem; color: #ca8a04; font-weight: 600;">
              🛡️ Escudo activo hasta ${new Date(ownership.shield_until!).toLocaleString()}
            </p>
          ` : ''}
        </div>
        <div style="text-align: center; padding: 12px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; color: white; font-weight: 700; font-size: 1rem;">
          👑 Ciudad bajo tu control
        </div>
      `;
    } else if (city.ownership && city.ownership[0]) {
      const ownership = city.ownership[0];
      const hasShield = ownership.shield_until && new Date(ownership.shield_until) > new Date();
      
      content += `
        <div style="background: #fef2f2; padding: 12px; border-radius: 8px; margin-bottom: 12px; border: 2px solid #ef4444;">
          <p style="margin: 0 0 8px 0; font-weight: 700; color: #dc2626; font-size: 1rem;">
            🔴 CIUDAD ENEMIGA
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #991b1b;">
            <strong>👤 Dueño:</strong> ${ownership.owner?.username || 'Desconocido'}
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #991b1b;">
            <strong>👥 Habitantes:</strong> ${ownership.virtual_inhabitants.toLocaleString()}
          </p>
          <p style="margin: 6px 0; font-size: 0.9rem; color: #991b1b;">
            <strong>⭐ Nivel:</strong> ${ownership.city_level}
          </p>
          ${hasShield ? `
            <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 6px; border: 1px solid #f59e0b;">
              <p style="margin: 0; font-size: 0.85rem; color: #92400e; font-weight: 600;">
                🛡️ Escudo activo hasta:<br>
                ${new Date(ownership.shield_until!).toLocaleString()}
              </p>
            </div>
          ` : ''}
        </div>
      `;

      if (hasShield) {
        content += `
          <div style="text-align: center; padding: 12px; background: #fef3c7; border-radius: 8px; color: #92400e; font-weight: 600; border: 2px solid #f59e0b;">
            🛡️ No puedes atacar<br>Ciudad protegida
          </div>
        `;
      } else {
        content += `
          <button 
            style="
              width: 100%; 
              padding: 12px; 
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
              color: white; 
              border: none; 
              border-radius: 8px; 
              cursor: pointer; 
              font-weight: 700;
              font-size: 1.05rem;
              box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
              transition: transform 0.2s, box-shadow 0.2s;
            "
            onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(239, 68, 68, 0.4)'"
            onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(239, 68, 68, 0.3)'"
            onclick="window.attackCity('${city.id}')">
            ⚔️ INVADIR CIUDAD
          </button>
        `;
      }
    }

    content += `</div>`;
    return content;
  }

  setupGlobalFunctions() {
    (window as any).purchaseCity = async (cityId: string) => {
      await this.purchaseCity(cityId);
    };

    (window as any).attackCity = async (cityId: string) => {
      await this.attackCity(cityId);
    };
  }

  async purchaseCity(cityId: string) {
    if (!this.activeSeason) {
      this.showNotification('warning', '⚠️ No Disponible', 'No hay temporada activa');
      return;
    }

    const city = this.cities.find(c => c.id === cityId);
    if (!city) return;

    const virtualInhabitants = Math.floor(city.real_population * 0.1);
    
    const confirmMessage = `
🏙️ ${city.name}
💰 Precio: $${city.base_price} USD
👥 Habitantes: ${virtualInhabitants.toLocaleString()}

¿Confirmar compra?
(Esto es una simulación - sin pago real por ahora)
    `.trim();

    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    try {
      await this.cityService.purchaseCity(cityId, this.activeSeason.id, this.userId);
      
      this.showNotification(
        'success',
        '🏙️ Ciudad Comprada',
        `¡${city.name} ahora es tuya!`,
        `+${virtualInhabitants.toLocaleString()} habitantes virtuales`,
        10000
      );
      
      await this.loadUserProfile();
      await this.loadUserCities();
      await this.refreshMapData();
      
    } catch (error: any) {
      console.error('Error comprando ciudad:', error);
      this.showNotification(
        'danger',
        '❌ Error de Compra',
        error.message || 'No se pudo completar la compra',
        'Intenta nuevamente',
        8000
      );
    }
  }

  async attackCity(cityId: string) {
    if (!this.activeSeason) {
      this.showNotification('warning', '⚠️ No Disponible', 'No hay temporada activa');
      return;
    }

    const city = this.cities.find(c => c.id === cityId);
    if (!city || !city.ownership || city.ownership.length === 0) return;

    const defender = city.ownership[0];

    if (defender.shield_until && new Date(defender.shield_until) > new Date()) {
      const shieldEnds = new Date(defender.shield_until);
      this.showNotification(
        'warning',
        '🛡️ Ciudad Protegida',
        'Esta ciudad tiene escudo activo',
        `Termina: ${shieldEnds.toLocaleString()}`,
        8000
      );
      return;
    }

    const attackerPower = this.userCities.reduce((sum, c) => {
      return sum + (c.ownership?.[0]?.virtual_inhabitants || 0);
    }, 0);

    if (attackerPower === 0) {
      this.showNotification('warning', '⚠️ Sin Poder', 'Necesitas al menos una ciudad para atacar');
      return;
    }

    const defenderPower = defender.virtual_inhabitants;

    const conquestIndex = this.invasionService.calculateConquestIndex(
      attackerPower,
      defenderPower,
      defender.city_level,
      false
    );

    const confirmMessage = `
⚔️ INICIAR INVASIÓN

🏙️ Ciudad: ${city.name}
👤 Defensor: ${defender.owner?.username}
👥 Habitantes defensa: ${defenderPower.toLocaleString()}

📊 TU PODER DE ATAQUE: ${attackerPower.toLocaleString()}
📈 Índice de Conquista: ${conquestIndex.toFixed(1)}%

⏱️ Duración: 24 segundos (modo testing)
🎲 Probabilidad de victoria: ${conquestIndex.toFixed(1)}%

⚠️ Si pierdes, perderás el 10% de tus habitantes

¿Iniciar invasión?
    `.trim();

    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    try {
      const invasion = await this.invasionService.startInvasion(
        cityId,
        this.activeSeason.id,
        this.userId,
        defender.owner_id
      );

      const timeRemaining = this.getTimeRemaining(invasion.ends_at);
      
      this.showNotification(
        'warning',
        '⚔️ Invasión Iniciada',
        `Atacando ${city.name} de ${defender.owner?.username}`,
        `Probabilidad: ${conquestIndex.toFixed(1)}% • Duración: ${timeRemaining}`,
        12000
      );

      await this.refreshMapData();

    } catch (error: any) {
      console.error('Error iniciando invasión:', error);
      this.showNotification(
        'danger',
        '❌ Error de Invasión',
        error.message || 'No se pudo iniciar la invasión',
        'Verifica que la ciudad no tenga escudo',
        8000
      );
    }
  }

  refreshMap() {
    this.map.eachLayer((layer: any) => {
      if (layer instanceof L.CircleMarker) {
        this.map.removeLayer(layer);
      }
    });
    
    this.loadCities();
  }

  goToInvasions() {
    this.router.navigate(['/invasions']);
  }

  goToRankings() {
    this.router.navigate(['/rankings']);
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}