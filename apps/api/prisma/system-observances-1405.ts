import { toGregorianParts } from '@deska/shared';

export type SystemObservanceSeed = {
  sourceKey: string;
  title: string;
  calendar: 'jalali' | 'lunar';
  month: number;
  day: number;
  anchorJalali: [number, number, number];
  isHoliday: boolean;
};

const jalaliAnchor = (month: number, day: number) => [1405, month, day] as [number, number, number];
const lunarAnchor = (month: number, day: number, solarMonth: number, solarDay: number) => ({
  month,
  day,
  anchorJalali: [1405, solarMonth, solarDay] as [number, number, number],
});

export const OFFICIAL_OBSERVANCES_1405: SystemObservanceSeed[] = [
  { sourceKey: '1405-jalali-01-01-norouz', title: 'آغاز نوروز', calendar: 'jalali', month: 1, day: 1, anchorJalali: jalaliAnchor(1, 1), isHoliday: true },
  { sourceKey: '1405-lunar-10-01-eid-fitr', title: 'عید سعید فطر', calendar: 'lunar', ...lunarAnchor(10, 1, 1, 1), isHoliday: true },
  { sourceKey: '1405-jalali-01-02-norouz', title: 'عید نوروز', calendar: 'jalali', month: 1, day: 2, anchorJalali: jalaliAnchor(1, 2), isHoliday: true },
  { sourceKey: '1405-lunar-10-02-eid-fitr-holiday', title: 'تعطیل به مناسبت عید سعید فطر', calendar: 'lunar', ...lunarAnchor(10, 2, 1, 2), isHoliday: true },
  { sourceKey: '1405-jalali-01-03-norouz', title: 'عید نوروز', calendar: 'jalali', month: 1, day: 3, anchorJalali: jalaliAnchor(1, 3), isHoliday: true },
  { sourceKey: '1405-jalali-01-04-norouz', title: 'عید نوروز', calendar: 'jalali', month: 1, day: 4, anchorJalali: jalaliAnchor(1, 4), isHoliday: true },
  { sourceKey: '1405-jalali-01-12-republic-day', title: 'روز جمهوری اسلامی ایران', calendar: 'jalali', month: 1, day: 12, anchorJalali: jalaliAnchor(1, 12), isHoliday: true },
  { sourceKey: '1405-jalali-01-13-nature-day', title: 'روز طبیعت', calendar: 'jalali', month: 1, day: 13, anchorJalali: jalaliAnchor(1, 13), isHoliday: true },
  { sourceKey: '1405-lunar-10-25-imam-sadegh', title: 'شهادت حضرت امام جعفر صادق (ع)', calendar: 'lunar', ...lunarAnchor(10, 25, 1, 25), isHoliday: true },
  { sourceKey: '1405-lunar-12-10-eid-qorban', title: 'عید سعید قربان', calendar: 'lunar', ...lunarAnchor(12, 10, 3, 6), isHoliday: true },
  { sourceKey: '1405-lunar-12-18-eid-ghadir', title: 'عید سعید غدیر خم', calendar: 'lunar', ...lunarAnchor(12, 18, 3, 14), isHoliday: true },
  { sourceKey: '1405-jalali-03-14-rahlet-imam-khomeini', title: 'رحلت حضرت امام خمینی (ره)', calendar: 'jalali', month: 3, day: 14, anchorJalali: jalaliAnchor(3, 14), isHoliday: true },
  { sourceKey: '1405-jalali-03-15-khordad-uprising', title: 'قیام خونین ۱۵ خرداد', calendar: 'jalali', month: 3, day: 15, anchorJalali: jalaliAnchor(3, 15), isHoliday: true },
  { sourceKey: '1405-lunar-01-09-tasua', title: 'تاسوعای حسینی', calendar: 'lunar', ...lunarAnchor(1, 9, 4, 3), isHoliday: true },
  { sourceKey: '1405-lunar-01-10-ashura', title: 'عاشورای حسینی', calendar: 'lunar', ...lunarAnchor(1, 10, 4, 4), isHoliday: true },
  { sourceKey: '1405-lunar-02-20-arbaeen', title: 'اربعین حسینی', calendar: 'lunar', ...lunarAnchor(2, 20, 5, 13), isHoliday: true },
  { sourceKey: '1405-lunar-02-28-prophet-death', title: 'رحلت حضرت رسول اکرم (ص) و شهادت امام حسن مجتبی (ع)', calendar: 'lunar', ...lunarAnchor(2, 28, 5, 21), isHoliday: true },
  { sourceKey: '1405-lunar-02-30-imam-reza', title: 'شهادت حضرت امام رضا (ع)', calendar: 'lunar', ...lunarAnchor(2, 30, 5, 22), isHoliday: true },
  { sourceKey: '1405-lunar-03-08-imam-askari', title: 'شهادت حضرت امام حسن عسکری (ع) و آغاز امامت حضرت ولیعصر (عج)', calendar: 'lunar', ...lunarAnchor(3, 8, 5, 30), isHoliday: true },
  { sourceKey: '1405-lunar-03-17-prophet-birthday', title: 'ولادت حضرت رسول اکرم (ص) و ولادت امام جعفر صادق (ع)', calendar: 'lunar', ...lunarAnchor(3, 17, 6, 8), isHoliday: true },
  { sourceKey: '1405-lunar-06-03-fatima-martyrdom', title: 'شهادت حضرت فاطمه زهرا (س)', calendar: 'lunar', ...lunarAnchor(6, 3, 8, 22), isHoliday: true },
  { sourceKey: '1405-lunar-07-13-imam-ali-birthday', title: 'ولادت حضرت امام علی (ع) و روز پدر', calendar: 'lunar', ...lunarAnchor(7, 13, 10, 2), isHoliday: true },
  { sourceKey: '1405-lunar-07-27-mabath', title: 'مبعث حضرت رسول اکرم (ص)', calendar: 'lunar', ...lunarAnchor(7, 27, 10, 16), isHoliday: true },
  { sourceKey: '1405-lunar-08-15-imam-mahdi-birthday', title: 'ولادت حضرت قائم (عج)', calendar: 'lunar', ...lunarAnchor(8, 15, 11, 4), isHoliday: true },
  { sourceKey: '1405-jalali-11-22-revolution-victory', title: 'پیروزی انقلاب اسلامی ایران', calendar: 'jalali', month: 11, day: 22, anchorJalali: jalaliAnchor(11, 22), isHoliday: true },
  { sourceKey: '1405-lunar-09-21-imam-ali-martyrdom', title: 'شهادت حضرت امام علی (ع)', calendar: 'lunar', ...lunarAnchor(9, 21, 12, 9), isHoliday: true },
  { sourceKey: '1405-lunar-10-01-eid-fitr-second', title: 'عید سعید فطر', calendar: 'lunar', ...lunarAnchor(10, 1, 12, 19), isHoliday: true },
  { sourceKey: '1405-lunar-10-02-eid-fitr-second-holiday', title: 'تعطیل به مناسبت عید سعید فطر', calendar: 'lunar', ...lunarAnchor(10, 2, 12, 20), isHoliday: true },
  { sourceKey: '1405-jalali-12-29-oil-nationalization', title: 'روز ملی شدن صنعت نفت ایران', calendar: 'jalali', month: 12, day: 29, anchorJalali: jalaliAnchor(12, 29), isHoliday: true },
];

export function observanceAnchorDate(observance: SystemObservanceSeed): Date {
  const [year, month, day] = observance.anchorJalali;
  const gregorian = toGregorianParts(year, month, day);
  return new Date(Date.UTC(gregorian.gy, gregorian.gm - 1, gregorian.gd, 12));
}
