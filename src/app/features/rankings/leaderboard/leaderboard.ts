import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RankingService, RankingEntry } from '../../../core/services/ranking';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './leaderboard.html',
  styleUrls: ['./leaderboard.scss']
})
export class LeaderboardComponent implements OnInit {
  rankings: RankingEntry[] = [];
  loading = true;
  selectedTab: 'inhabitants' | 'cities' | 'countries' = 'inhabitants';
  currentUserId: string = '';
  userRank = { byInhabitants: 0, byCities: 0, byCountries: 0 };

  constructor(
    private rankingService: RankingService,
    private supabase: SupabaseService,
    private router: Router
  ) {}

  async ngOnInit() {
    const user = this.supabase.getCurrentUser();
    if (user) {
      this.currentUserId = user.id;
      this.loadUserRank();
    }
    
    this.loadRankings();
    
    // Auto-refresh cada 30 segundos
    setInterval(() => this.loadRankings(), 30000);
  }

  loadRankings() {
    this.loading = true;

    const observable = this.selectedTab === 'inhabitants' 
      ? this.rankingService.getTopByInhabitants()
      : this.selectedTab === 'cities'
      ? this.rankingService.getTopByCities()
      : this.rankingService.getTopByCountries();

    observable.subscribe({
      next: (rankings) => {
        this.rankings = rankings;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando rankings:', error);
        this.loading = false;
      }
    });
  }

  async loadUserRank() {
    this.userRank = await this.rankingService.getUserRank(this.currentUserId);
  }

  switchTab(tab: 'inhabitants' | 'cities' | 'countries') {
    this.selectedTab = tab;
    this.loadRankings();
  }

  getRankMedal(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }

  isCurrentUser(userId: string): boolean {
    return userId === this.currentUserId;
  }

  goToMap() {
    this.router.navigate(['/map']);
  }

  getCurrentUserRank(): number {
    if (this.selectedTab === 'inhabitants') return this.userRank.byInhabitants;
    if (this.selectedTab === 'cities') return this.userRank.byCities;
    return this.userRank.byCountries;
  }
}