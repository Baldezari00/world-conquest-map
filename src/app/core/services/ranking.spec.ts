import { TestBed } from '@angular/core/testing';

import { Ranking } from './ranking';

describe('Ranking', () => {
  let service: Ranking;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Ranking);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
