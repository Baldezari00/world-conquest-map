import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvasionsPanel } from './invasions-panel';

describe('InvasionsPanel', () => {
  let component: InvasionsPanel;
  let fixture: ComponentFixture<InvasionsPanel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvasionsPanel]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InvasionsPanel);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
