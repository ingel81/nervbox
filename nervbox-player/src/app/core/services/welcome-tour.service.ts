import { Injectable, signal, computed, inject, effect } from '@angular/core';
import Shepherd from 'shepherd.js';
import { offset } from '@floating-ui/dom';
import { AuthService } from './auth.service';

interface TourProgress {
  completed: boolean;
  completedAt: string;
  version: string;
  skippedAt?: string;
}

interface TourButton {
  text: string;
  action: () => void;
  secondary?: boolean;
}

@Injectable({ providedIn: 'root' })
export class WelcomeTourService {
  private readonly auth = inject(AuthService);

  private readonly USER_STORAGE_KEY = 'nervbox-welcome-tour';
  private readonly ADMIN_STORAGE_KEY = 'nervbox-admin-tour';
  private readonly TOUR_VERSION = '1.0.0';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tour: any = null;

  // User tour state
  readonly userTourCompleted = signal(false);
  readonly userTourActive = signal(false);

  // Admin tour state
  readonly adminTourCompleted = signal(false);
  readonly adminTourActive = signal(false);

  readonly shouldShowUserTour = computed(() => {
    return !this.userTourCompleted() && !this.userTourActive();
  });

  readonly shouldShowAdminTour = computed(() => {
    return (
      this.auth.currentUser()?.role === 'admin' &&
      !this.adminTourCompleted() &&
      !this.adminTourActive()
    );
  });

  constructor() {
    this.loadProgress();

    // Watch for admin login to trigger admin tour (only if user tour already completed)
    effect(() => {
      const user = this.auth.currentUser();
      if (
        user?.role === 'admin' &&
        this.userTourCompleted() &&
        this.shouldShowAdminTour()
      ) {
        // Delay to ensure UI is ready
        setTimeout(() => this.startAdminTour(), 500);
      }
    });
  }

  private loadProgress(): void {
    // Load user tour progress
    try {
      const saved = localStorage.getItem(this.USER_STORAGE_KEY);
      if (saved) {
        const progress: TourProgress = JSON.parse(saved);
        if (progress.completed && progress.version === this.TOUR_VERSION) {
          this.userTourCompleted.set(true);
        }
      }
    } catch {
      // Invalid data - tour will be shown
    }

    // Load admin tour progress
    try {
      const saved = localStorage.getItem(this.ADMIN_STORAGE_KEY);
      if (saved) {
        const progress: TourProgress = JSON.parse(saved);
        if (progress.completed && progress.version === this.TOUR_VERSION) {
          this.adminTourCompleted.set(true);
        }
      }
    } catch {
      // Invalid data - tour will be shown
    }
  }

  // ============ USER TOUR ============

  startUserTour(): void {
    if (this.userTourActive() || this.adminTourActive()) return;

    this.userTourActive.set(true);
    this.tour = this.createTour();
    this.addUserSteps();

    this.tour.on('complete', () => this.completeUserTour());
    this.tour.on('cancel', () => this.skipUserTour());

    this.tour.start();
  }

  private addUserSteps(): void {
    if (!this.tour) return;

    // Step 1: Welcome
    this.tour.addStep({
      id: 'welcome',
      title: 'Hey, Willkommen!',
      text: 'Nervbox – Mental Damage auf Knopfdruck.<br><br>Kurze Tour!',
      attachTo: { element: '.logo', on: 'bottom' },
      canClickTarget: false,
      cancelIcon: { enabled: false },
      buttons: [{ text: 'Zeig mir alles!', action: () => this.tour?.next() }],
    });

    // Step 2: Search
    this.tour.addStep({
      id: 'search',
      title: 'Suche',
      text: 'Tipp irgendwas ein - findet Namen und Tags. Probier mal "cabd" oder "hotdog".',
      attachTo: { element: '.search-container', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 3: Sort
    this.tour.addStep({
      id: 'sort',
      title: 'Sortieren',
      text: 'Sounds sortieren nach Name, Plays, Datum oder Länge.',
      attachTo: { element: '.sort-container', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 4: Tag Filter
    this.tour.addStep({
      id: 'tags',
      title: 'Tags',
      text: 'Tags anklicken um Sounds zu filtern. Suche findet weitere Tags.',
      attachTo: { element: 'app-tag-filter', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 5: Sound Card
    this.tour.addStep({
      id: 'soundcard',
      title: 'Sound abspielen',
      text: 'Sound abspielen per Klick. Weitere Optionen im Kontextmenü.',
      attachTo: { element: 'app-sound-card', on: 'top' },
      buttons: this.getNavButtons(),
    });

    // Step 6: Selection Mode
    this.tour.addStep({
      id: 'selection',
      title: 'Multi-Select',
      text: 'Sounds auswählen und gemeinsam im Mixer öffnen.',
      attachTo: { element: '[data-tour="selection"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 7: Mixer
    this.tour.addStep({
      id: 'mixer',
      title: 'Mixer',
      text: 'Sounds mixen, schneiden und loopen.',
      attachTo: { element: '[data-tour="mixer"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 8: Stats
    this.tour.addStep({
      id: 'stats',
      title: 'Statistiken',
      text: 'Meistgespielte Sounds und aktivste User.',
      attachTo: { element: '[data-tour="stats"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 9: Chat
    this.tour.addStep({
      id: 'chat',
      title: 'Chat',
      text: 'Echtzeit-Chat mit anderen Nutzern.',
      attachTo: { element: '[data-tour="chat"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 10: Login
    this.tour.addStep({
      id: 'login',
      title: 'Einloggen',
      text: 'Login nötig zum Mitmachen. Viel Spaß!',
      attachTo: { element: '[data-tour="profile"]', on: 'bottom' },
      buttons: [
        { text: 'Zurück', action: () => this.tour?.back(), secondary: true },
        { text: 'Fertig!', action: () => this.tour?.complete() },
      ],
    });
  }

  private completeUserTour(): void {
    const progress: TourProgress = {
      completed: true,
      completedAt: new Date().toISOString(),
      version: this.TOUR_VERSION,
    };
    localStorage.setItem(this.USER_STORAGE_KEY, JSON.stringify(progress));
    this.userTourCompleted.set(true);
    this.userTourActive.set(false);
    this.tour = null;

    // If admin and admin tour not seen, start admin tour after short delay
    if (this.shouldShowAdminTour()) {
      setTimeout(() => this.startAdminTour(), 500);
    }
  }

  private skipUserTour(): void {
    const progress: TourProgress = {
      completed: false,
      completedAt: '',
      version: this.TOUR_VERSION,
      skippedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.USER_STORAGE_KEY, JSON.stringify(progress));
    this.userTourActive.set(false);
    this.tour = null;
  }

  // ============ ADMIN TOUR ============

  startAdminTour(): void {
    if (this.userTourActive() || this.adminTourActive()) return;
    if (this.auth.currentUser()?.role !== 'admin') return;

    // Check if admin menu button is visible
    const adminMenu = document.querySelector('[data-tour="admin-menu"]');
    if (!adminMenu) {
      // Admin UI not ready yet, retry later
      setTimeout(() => this.startAdminTour(), 500);
      return;
    }

    this.adminTourActive.set(true);
    this.tour = this.createTour();
    this.addAdminSteps();

    this.tour.on('complete', () => this.completeAdminTour());
    this.tour.on('cancel', () => this.skipAdminTour());

    this.tour.start();
  }

  private addAdminSteps(): void {
    if (!this.tour) return;

    // Step 1: Admin Welcome
    this.tour.addStep({
      id: 'admin-welcome',
      title: 'Admin-Modus!',
      text: 'Du hast die Macht! Hier sind deine Admin-Tools für die volle Kontrolle.',
      attachTo: { element: '[data-tour="admin-menu"]', on: 'bottom' },
      canClickTarget: false,
      cancelIcon: { enabled: false },
      buttons: [{ text: 'Zeig her!', action: () => this.tour?.next() }],
    });

    // Step 2: Admin Menu
    this.tour.addStep({
      id: 'admin-menu',
      title: 'Admin-Menü',
      text: `Alle Admin-Funktionen an einem Ort:<br><br>
        <b>Userverwaltung</b> - User anlegen, deaktivieren, Passwörter zurücksetzen<br>
        <b>Tag-Verwaltung</b> - Tags erstellen, bearbeiten, löschen<br>
        <b>Tag-Wizard</b> - Schnelles Taggen vieler Sounds<br>
        <b>Sounds stoppen</b> - Alle laufenden Sounds beenden`,
      attachTo: { element: '[data-tour="admin-menu"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 3: Sound Card Admin Menu
    this.tour.addStep({
      id: 'admin-soundcard',
      title: 'Sound-Verwaltung',
      text: 'Sounds bearbeiten, deaktivieren oder löschen. Vorsicht beim Löschen!',
      attachTo: { element: 'app-sound-card', on: 'top' },
      buttons: [
        { text: 'Zurück', action: () => this.tour?.back(), secondary: true },
        { text: 'Alles klar!', action: () => this.tour?.complete() },
      ],
    });
  }

  private completeAdminTour(): void {
    const progress: TourProgress = {
      completed: true,
      completedAt: new Date().toISOString(),
      version: this.TOUR_VERSION,
    };
    localStorage.setItem(this.ADMIN_STORAGE_KEY, JSON.stringify(progress));
    this.adminTourCompleted.set(true);
    this.adminTourActive.set(false);
    this.tour = null;
  }

  private skipAdminTour(): void {
    const progress: TourProgress = {
      completed: false,
      completedAt: '',
      version: this.TOUR_VERSION,
      skippedAt: new Date().toISOString(),
    };
    localStorage.setItem(this.ADMIN_STORAGE_KEY, JSON.stringify(progress));
    this.adminTourActive.set(false);
    this.tour = null;
  }

  // ============ SHARED ============

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createTour(): any {
    return new Shepherd.Tour({
      useModalOverlay: true,
      defaultStepOptions: {
        classes: 'nervbox-tour-step',
        scrollTo: { behavior: 'smooth', block: 'center' },
        cancelIcon: { enabled: false },
        canClickTarget: false,
        modalOverlayOpeningPadding: 8,
        modalOverlayOpeningRadius: 8,
        floatingUIOptions: {
          middleware: [offset(16)],
        },
      },
    });
  }

  private getNavButtons(): TourButton[] {
    return [
      { text: 'Zurück', action: () => this.tour?.back(), secondary: true },
      { text: 'Weiter', action: () => this.tour?.next() },
    ];
  }

  // Public methods for menu

  /**
   * Starts the appropriate tour(s) based on user role.
   * For admins: runs user tour first (if not completed), then admin tour.
   * For users: runs user tour only.
   */
  restartTour(): void {
    this.resetUserTour();
    if (this.auth.currentUser()?.role === 'admin') {
      this.resetAdminTour();
    }
    setTimeout(() => this.startUserTour(), 100);
  }

  resetUserTour(): void {
    localStorage.removeItem(this.USER_STORAGE_KEY);
    this.userTourCompleted.set(false);
  }

  resetAdminTour(): void {
    localStorage.removeItem(this.ADMIN_STORAGE_KEY);
    this.adminTourCompleted.set(false);
  }
}
