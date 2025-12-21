import { Injectable, signal, computed, inject, effect } from '@angular/core';
import Shepherd from 'shepherd.js';
import { offset } from '@floating-ui/dom';
import { AuthService } from './auth.service';
import { AchievementService } from './achievement.service';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { ShekelPopoverComponent } from '../../components/shared/shekel-popover/shekel-popover.component';

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
  private readonly achievementService = inject(AchievementService);
  private readonly dialog = inject(MatDialog);

  private readonly USER_STORAGE_KEY = 'nervbox-welcome-tour';
  private readonly ADMIN_STORAGE_KEY = 'nervbox-admin-tour';
  private readonly TOUR_VERSION = '2.2.0'; // Added "Mein Profil" menu item

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tour: any = null;
  private shekelDialogRef: MatDialogRef<ShekelPopoverComponent> | null = null;

  // User tour state
  readonly userTourCompleted = signal(false);
  readonly userTourActive = signal(false);

  // Admin tour state
  readonly adminTourCompleted = signal(false);
  readonly adminTourActive = signal(false);

  readonly shouldShowUserTour = computed(() => {
    // Tour nur für eingeloggte User - sonst fehlen UI-Elemente
    return this.auth.isLoggedIn() && !this.userTourCompleted() && !this.userTourActive();
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
    this.setupButtonClickInterceptor();

    // Watch for login to trigger user tour
    effect(() => {
      const user = this.auth.currentUser();
      if (user && this.shouldShowUserTour()) {
        // Delay to ensure UI is ready after login
        setTimeout(() => this.startUserTour(), 500);
      }
    });

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

  // ============ HELPER: MENU CONTROL ============

  private openMenu(selector: string): Promise<void> {
    return new Promise(resolve => {
      const trigger = document.querySelector(selector) as HTMLElement;
      if (trigger) {
        trigger.click();
        // Wait for menu animation
        setTimeout(resolve, 300);
      } else {
        resolve();
      }
    });
  }

  private closeAllMenus(): void {
    // Click backdrop or press escape to close menus
    const backdrop = document.querySelector('.cdk-overlay-backdrop') as HTMLElement;
    if (backdrop) {
      backdrop.click();
    }
  }

  private openShekelDialog(tabIndex = 0): Promise<void> {
    return new Promise(resolve => {
      // Close any existing dialog first
      if (this.shekelDialogRef) {
        this.shekelDialogRef.close();
      }

      this.shekelDialogRef = this.dialog.open(ShekelPopoverComponent, {
        panelClass: 'shekel-popover-dialog',
        backdropClass: 'shekel-popover-backdrop',
        autoFocus: false,
        disableClose: true, // Prevent closing during tour
      });

      // Wait for dialog to open, then switch to the right tab
      setTimeout(() => {
        if (tabIndex > 0) {
          // Find the tab group and click the second tab
          const tabs = document.querySelectorAll('.shekel-popover .mat-mdc-tab');
          if (tabs[tabIndex]) {
            (tabs[tabIndex] as HTMLElement).click();
          }
        }
        setTimeout(resolve, 200);
      }, 300);
    });
  }

  private closeShekelDialog(): void {
    if (this.shekelDialogRef) {
      this.shekelDialogRef.close();
      this.shekelDialogRef = null;
    }
  }

  /**
   * Prevents CDK backdrop from closing menus during the tour.
   * We disable pointer-events on the backdrop when a menu step is shown.
   */
  private setupButtonClickInterceptor(): void {
    // Add CSS to disable backdrop clicks during tour menu steps
    const style = document.createElement('style');
    style.id = 'shepherd-menu-fix';
    style.textContent = `
      body.shepherd-menu-step-active .cdk-overlay-backdrop {
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  private setMenuStepActive(active: boolean): void {
    if (active) {
      document.body.classList.add('shepherd-menu-step-active');
    } else {
      document.body.classList.remove('shepherd-menu-step-active');
    }
  }

  // ============ USER TOUR ============

  startUserTour(): void {
    // Tour nur für eingeloggte User
    if (!this.auth.isLoggedIn()) return;
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
      text: 'Nervbox – ADHS auf Knopfdruck.<br><br>Lass mich dir alles zeigen!',
      attachTo: { element: '.logo', on: 'bottom' },
      canClickTarget: false,
      cancelIcon: { enabled: false },
      buttons: [{ text: 'Los geht\'s!', action: () => this.tour?.next() }],
    });

    // Step 2: Search
    this.tour.addStep({
      id: 'search',
      title: 'Suche',
      text: 'Tipp irgendwas ein - findet Namen und Tags.<br><br>Probier mal "cabd" oder "hotdog".',
      attachTo: { element: '.search-container', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 3: Sort
    this.tour.addStep({
      id: 'sort',
      title: 'Sortieren',
      text: 'Sounds sortieren nach:<br><br>• Name (A-Z / Z-A)<br>• Beliebteste (meistgespielt)<br>• Beste Bewertungen<br>• Neueste<br>• Länge<br>• Zufall',
      attachTo: { element: '.sort-container', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 4: Tag Filter
    this.tour.addStep({
      id: 'tags',
      title: 'Tags',
      text: 'Tags anklicken um Sounds zu filtern.<br><br>Mehrere Tags = UND-Verknüpfung.<br>Die Suche findet auch passende Tags!',
      attachTo: { element: 'app-tag-filter', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 5: Shekel Display
    this.tour.addStep({
      id: 'shekel',
      title: 'Nervbox Shekel (N$)',
      text: 'Deine Währung! Jeder Sound kostet N$.<br><br>• Du bekommst stündlich neue N$<br>• Wird rot wenn fast leer<br>• Klick drauf für mehr Optionen!',
      attachTo: { element: '.credit-display', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 6: Shekel Transfer (Tab 0 - Senden)
    this.tour.addStep({
      id: 'shekel-transfer',
      title: 'Shekel senden',
      text: 'Sei großzügig!<br><br>Sende N$ an bedürftige User.',
      attachTo: { element: '.shekel-popover', on: 'right' },
      buttons: this.getNavButtons(),
      beforeShowPromise: () => {
        this.setMenuStepActive(true);
        return this.openShekelDialog(0);
      },
    });

    // Step 7: Shekel Casino (Tab 1 - Gambeln)
    this.tour.addStep({
      id: 'shekel-casino',
      title: 'Shekel Casino',
      text: 'Feeling lucky?<br><br>Setze deine N$ ein und verdopple sie - oder verliere alles!<br><br><b>50/50 Chance</b>',
      attachTo: { element: '.shekel-popover', on: 'right' },
      buttons: this.getNavButtons(),
      beforeShowPromise: () => {
        return this.openShekelDialog(1);
      },
      when: {
        hide: () => {
          this.setMenuStepActive(false);
          this.closeShekelDialog();
        },
      },
    });

    // Step 8: Sound Card
    this.tour.addStep({
      id: 'soundcard',
      title: 'Sound abspielen',
      text: 'Klick auf eine Karte = Sound abspielen!<br><br>Die Karte zeigt:<br>• Name und Länge<br>• Play-Count<br>• Wer den Sound erstellt hat',
      attachTo: { element: 'app-sound-card', on: 'top' },
      buttons: this.getNavButtons(),
    });

    // Step 7: Sound Card Menu (3 dots) - opened
    this.tour.addStep({
      id: 'soundcard-menu',
      title: 'Sound-Optionen',
      text: `Das Drei-Punkte-Menü bietet:<br><br>
        • <b>Auf Nervbox abspielen</b> - Spielt auf dem Pi<br>
        • <b>Im Browser anhören</b> - Spielt lokal in deinem Browser<br>
        • <b>Im Mixer öffnen</b> - Zum Bearbeiten und Mixen`,
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
      beforeShowPromise: () => {
        this.setMenuStepActive(true);
        return this.openMenu('app-sound-card .more-btn');
      },
      when: {
        hide: () => {
          this.setMenuStepActive(false);
          this.closeAllMenus();
        },
      },
    });

    // Step 8: Selection Mode
    this.tour.addStep({
      id: 'selection',
      title: 'Multi-Select',
      text: 'Mehrere Sounds auswählen!<br><br>1. Aktiviere den Auswahlmodus<br>2. Klicke auf Sounds zum Auswählen<br>3. Öffne alle gemeinsam im Mixer',
      attachTo: { element: '[data-tour="selection"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 9: Mixer
    this.tour.addStep({
      id: 'mixer',
      title: 'Der Mixer',
      text: 'Sounds mixen und überlagern<br>• Schneiden und loopen<br>• Neue Sounds erstellen',
      attachTo: { element: '[data-tour="mixer"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 10: Stats
    this.tour.addStep({
      id: 'stats',
      title: 'Statistiken',
      text: 'Wer nervt am meisten?<br><br>• <b>Top Sounds</b> - Meistgespielte Hits<br>• <b>Top User</b> - Die aktivsten Nervensägen',
      attachTo: { element: '[data-tour="stats"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 11: Chat
    this.tour.addStep({
      id: 'chat',
      title: 'Chat',
      text: 'Echtzeit-Chat mit allen!<br><br>• Nachrichten schreiben<br>• <b>GIFs senden</b> - Klick auf das GIF-Icon<br>',
      attachTo: { element: '[data-tour="chat"]', on: 'bottom' },
      buttons: this.getNavButtons(),
    });

    // Step 12: Profile Menu - intro
    this.tour.addStep({
      id: 'profile-intro',
      title: 'Dein Profil',
      text: 'Hier findest du deine persönlichen Einstellungen.<br><br>Klicke auf dein Avatar für mehr Optionen!',
      attachTo: { element: '[data-tour="profile"]', on: 'bottom' },
      buttons: this.getNavButtons(),
      beforeShowPromise: () => {
        this.closeAllMenus();
        return Promise.resolve();
      },
    });

    // Step 13: Profile Menu - opened
    this.tour.addStep({
      id: 'profile-menu',
      title: 'Profil-Menü',
      text: `Im Profil-Menü kannst du:<br><br>
        • <b>Mein Profil</b> - Deine Stats & Achievements<br>
        • <b>Avatar ändern</b> - Dein Profilbild<br>
        • <b>Kennwort ändern</b> - Sicherheit<br>
        • <b>Tour starten</b> - Diese Tour nochmal<br>
        • <b>Abmelden</b> - Tschüss!`,
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
      beforeShowPromise: () => {
        this.setMenuStepActive(true);
        return this.openMenu('[data-tour="profile"]');
      },
      when: {
        hide: () => {
          this.setMenuStepActive(false);
          this.closeAllMenus();
        },
      },
    });

    // Step 14: Finish
    this.tour.addStep({
      id: 'finish',
      title: 'Fertig!',
      text: 'Du kennst jetzt alle Basics!<br><br> Viel Spaß!',
      attachTo: { element: '.logo', on: 'bottom' },
      buttons: [
        { text: 'Zurück', action: () => this.tour?.back(), secondary: true },
        { text: 'Let\'s go!', action: () => this.tour?.complete() },
      ],
      beforeShowPromise: () => {
        this.closeAllMenus();
        return Promise.resolve();
      },
    });
  }

  private completeUserTour(): void {
    this.closeAllMenus();
    const progress: TourProgress = {
      completed: true,
      completedAt: new Date().toISOString(),
      version: this.TOUR_VERSION,
    };
    localStorage.setItem(this.USER_STORAGE_KEY, JSON.stringify(progress));
    this.userTourCompleted.set(true);
    this.userTourActive.set(false);
    this.tour = null;

    // Grant tour completed achievement
    this.achievementService.markTourCompleted().subscribe();

    // If admin and admin tour not seen, start admin tour after short delay
    if (this.shouldShowAdminTour()) {
      setTimeout(() => this.startAdminTour(), 500);
    }
  }

  private skipUserTour(): void {
    this.closeAllMenus();
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
      text: 'Du hast die Macht!<br><br>Lass mich dir die Admin-Tools zeigen.',
      attachTo: { element: '[data-tour="admin-menu"]', on: 'bottom' },
      canClickTarget: false,
      cancelIcon: { enabled: false },
      buttons: [{ text: 'Zeig her!', action: () => this.tour?.next() }],
    });

    // Step 2: Admin Menu - opened
    this.tour.addStep({
      id: 'admin-menu-open',
      title: 'Admin-Menü',
      text: 'Hier sind alle Admin-Funktionen versammelt.',
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
      beforeShowPromise: () => {
        this.setMenuStepActive(true);
        return this.openMenu('[data-tour="admin-menu"]');
      },
    });

    // Step 3: User Management
    this.tour.addStep({
      id: 'admin-users',
      title: 'Userverwaltung',
      text: 'Alle User im Überblick:<br><br>• User aktivieren/deaktivieren<br>• Passwörter zurücksetzen<br>• Rollen ändern (User/Admin)<br>• N$ vergeben',
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
    });

    // Step 4: Tag Management
    this.tour.addStep({
      id: 'admin-tags',
      title: 'Tag-Verwaltung',
      text: 'Tags organisieren:<br><br>• Neue Tags erstellen<br>• Tags umbenennen<br>• Unbenutzte Tags löschen<br>• Farben anpassen',
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
    });

    // Step 5: Tag Wizard
    this.tour.addStep({
      id: 'admin-wizard',
      title: 'Tag-Wizard',
      text: 'Schnelles Taggen!<br><br>Viele Sounds auf einmal mit Tags versehen. Perfekt für neue Sound-Pakete.',
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
    });

    // Step 6: Shekel Settings
    this.tour.addStep({
      id: 'admin-shekel',
      title: 'N$-Einstellungen',
      text: 'Die Wirtschaft kontrollieren:<br><br>• Start-N$ für neue User<br>• Kosten pro Sound<br>• Stündliche Bonus-N$<br>• Maximum für User',
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
    });

    // Step 7: Kill All
    this.tour.addStep({
      id: 'admin-killall',
      title: 'Alle Sounds stoppen',
      text: 'Der Notfall-Knopf!<br><br>Stoppt ALLE laufenden Sounds auf dem Pi sofort. Für den Fall der Fälle.',
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: this.getNavButtons(),
      when: {
        hide: () => {
          this.setMenuStepActive(false);
          this.closeAllMenus();
        },
      },
    });

    // Step 8: Sound Card Admin Options - opened
    this.tour.addStep({
      id: 'admin-soundcard',
      title: 'Admin-Optionen',
      text: `Als Admin siehst du im Menü zusätzlich:<br><br>
        • <b>Bearbeiten</b> - Name und Tags ändern<br>
        • <b>Deaktivieren</b> - Sound verstecken<br>
        • <b>Löschen</b> - Unwiderruflich!`,
      attachTo: { element: '.cdk-overlay-pane', on: 'left' },
      buttons: [
        { text: 'Zurück', action: () => this.tour?.back(), secondary: true },
        { text: 'Verstanden!', action: () => this.tour?.complete() },
      ],
      beforeShowPromise: () => {
        this.setMenuStepActive(true);
        return this.openMenu('app-sound-card .more-btn');
      },
      when: {
        hide: () => {
          this.setMenuStepActive(false);
          this.closeAllMenus();
        },
      },
    });
  }

  private completeAdminTour(): void {
    this.closeAllMenus();
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
    this.closeAllMenus();
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
