import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventsFeed } from './events-feed';

describe('EventsFeed', () => {
  let component: EventsFeed;
  let fixture: ComponentFixture<EventsFeed>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventsFeed]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventsFeed);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
