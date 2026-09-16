import { Injectable } from '@angular/core';
export type PhilippineHolidayType = 'regular' | 'special';
export type MoonPhaseType = 'new' | 'first-quarter' | 'full' | 'last-quarter';
export interface PhilippineHoliday {
  name: string;
  date: string;
  type: PhilippineHolidayType;
}
export interface MoonPhase {
  date: string;
  phase: MoonPhaseType;
  label: string;
  icon: string;
}
@Injectable({
  providedIn: 'root',
})
export class CalendarService {
  getPhilippineHolidays(year: number): PhilippineHoliday[] {
    const holidays: PhilippineHoliday[] = [
      this.createHoliday(year, 0, 1, "New Year's Day", 'regular'),
      this.createHoliday(year, 1, 25, 'EDSA People Power Revolution Anniversary', 'special'),
      this.createHoliday(year, 3, 9, 'Araw ng Kagitingan', 'regular'),
      this.createHoliday(year, 4, 1, 'Labor Day', 'regular'),
      this.createHoliday(year, 5, 12, 'Independence Day', 'regular'),
      this.createHoliday(year, 7, 21, 'Ninoy Aquino Day', 'special'),
      this.createHoliday(
        year,
        7,
        this.getLastMondayOfMonth(year, 7),
        'National Heroes Day',
        'regular',
      ),
      this.createHoliday(year, 10, 1, "All Saints' Day", 'special'),
      this.createHoliday(year, 10, 2, "All Souls' Day", 'special'),
      this.createHoliday(year, 10, 30, 'Bonifacio Day', 'regular'),
      this.createHoliday(year, 11, 8, 'Feast of the Immaculate Conception', 'special'),
      this.createHoliday(year, 11, 24, 'Christmas Eve', 'special'),
      this.createHoliday(year, 11, 25, 'Christmas Day', 'regular'),
      this.createHoliday(year, 11, 30, 'Rizal Day', 'regular'),
      this.createHoliday(year, 11, 31, "New Year's Eve", 'special'),
    ];
    const easter = this.getEasterSunday(year);
    holidays.push(
      this.createHolidayFromDate(this.addDays(easter, -3), 'Maundy Thursday', 'regular'),
    );
    holidays.push(this.createHolidayFromDate(this.addDays(easter, -2), 'Good Friday', 'regular'));
    holidays.push(
      this.createHolidayFromDate(this.addDays(easter, -1), 'Black Saturday', 'special'),
    );
    return holidays.sort((a, b) => a.date.localeCompare(b.date));
  }
  getHolidaysForMonth(year: number, month: number): PhilippineHoliday[] {
    const monthValue = String(month + 1).padStart(2, '0');
    const prefix = `${year}-${monthValue}-`;
    return this.getPhilippineHolidays(year).filter((holiday) => holiday.date.startsWith(prefix));
  }
  getHoliday(date: string): PhilippineHoliday | null {
    const year = Number(date.slice(0, 4));
    if (!Number.isFinite(year)) {
      return null;
    }
    return this.getPhilippineHolidays(year).find((holiday) => holiday.date === date) || null;
  }
  getMoonPhases(year: number, month: number): MoonPhase[] {
    const phases: MoonPhase[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const phase = this.calculateMoonPhase(year, month, day);
      if (phase) {
        phases.push({
          date: this.formatDate(year, month, day),
          ...phase,
        });
      }
    }
    return phases;
  }
  getMoonPhase(date: string): MoonPhase | null {
    const parts = date.split('-').map(Number);
    if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
      return null;
    }
    const [year, month, day] = parts;
    const phase = this.calculateMoonPhase(year, month - 1, day);
    if (!phase) {
      return null;
    }
    return {
      date,
      ...phase,
    };
  }
  private createHoliday(
    year: number,
    month: number,
    day: number,
    name: string,
    type: PhilippineHolidayType,
  ): PhilippineHoliday {
    return {
      name,
      date: this.formatDate(year, month, day),
      type,
    };
  }
  private createHolidayFromDate(
    date: Date,
    name: string,
    type: PhilippineHolidayType,
  ): PhilippineHoliday {
    return {
      name,
      date: this.formatDate(date.getFullYear(), date.getMonth(), date.getDate()),
      type,
    };
  }
  private formatDate(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  private getLastMondayOfMonth(year: number, month: number): number {
    const date = new Date(year, month + 1, 0);
    while (date.getDay() !== 1) {
      date.setDate(date.getDate() - 1);
    }
    return date.getDate();
  }
  private getEasterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  private calculateMoonPhase(
    year: number,
    month: number,
    day: number,
  ): Omit<MoonPhase, 'date'> | null {
    const lunarCycle = 29.530588853;
    const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
    const current = Date.UTC(year, month, day, 12);
    const daysSinceKnownNewMoon = (current - knownNewMoon) / 86400000;
    const age = ((daysSinceKnownNewMoon % lunarCycle) + lunarCycle) % lunarCycle;
    const phases: { age: number; phase: MoonPhaseType; label: string; icon: string }[] = [
      { age: 0, phase: 'new', label: 'New Moon', icon: '●' },
      { age: lunarCycle / 4, phase: 'first-quarter', label: 'First Quarter', icon: '◐' },
      { age: lunarCycle / 2, phase: 'full', label: 'Full Moon', icon: '○' },
      { age: (lunarCycle * 3) / 4, phase: 'last-quarter', label: 'Last Quarter', icon: '◑' },
    ];
    let closest = phases[0];
    let closestDistance = this.getCircularMoonDistance(age, closest.age, lunarCycle);
    for (const phase of phases.slice(1)) {
      const distance = this.getCircularMoonDistance(age, phase.age, lunarCycle);
      if (distance < closestDistance) {
        closest = phase;
        closestDistance = distance;
      }
    }
    if (closestDistance > 0.55) {
      return null;
    }
    return {
      phase: closest.phase,
      label: closest.label,
      icon: closest.icon,
    };
  }
  private getCircularMoonDistance(age: number, target: number, cycle: number): number {
    const distance = Math.abs(age - target);
    return Math.min(distance, cycle - distance);
  }
}
