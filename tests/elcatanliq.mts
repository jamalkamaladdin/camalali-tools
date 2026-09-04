import type { CheckSuite } from "./harness.mts";
import {
  combineParallel,
  combineSequential,
  computeAllowedDowntime,
  computeSystemAvailability,
  percentFromDowntime,
} from "../lib/elcatanliq";

const EPS = 1e-6;

export const checks: CheckSuite = (check) => {
  const yearly999 = computeAllowedDowntime(99.9, "il");
  check(
    "99,9% ildə 525,6 dəqiqə dayanma verir (365 günlük il)",
    yearly999.ok && Math.abs(yearly999.minutes - 525.6) < 1e-3,
    JSON.stringify(yearly999),
  );

  const yearly99 = computeAllowedDowntime(99, "il");
  check(
    "99% ildə 5256 dəqiqə (~3,65 gün) dayanma verir",
    yearly99.ok && Math.abs(yearly99.minutes - 5_256) < 1e-3,
    JSON.stringify(yearly99),
  );

  const perfect = computeAllowedDowntime(100, "il");
  check("100% əlçatanlıq sıfır dayanma verir (sərhəd)", perfect.ok && perfect.seconds === 0, JSON.stringify(perfect));

  const negativePercent = computeAllowedDowntime(-5, "gun");
  check("mənfi faiz xəta qaytarır", negativePercent.ok === false, JSON.stringify(negativePercent));

  const overHundred = computeAllowedDowntime(150, "gun");
  check("100-dən böyük faiz xəta qaytarır", overHundred.ok === false, JSON.stringify(overHundred));

  const roundTrip = percentFromDowntime(yearly999.ok ? yearly999.minutes : 0, "il");
  check(
    "faiz→dayanma→faiz gediş-gəlişi orijinal faizi verir",
    roundTrip.ok && roundTrip.percent !== undefined && Math.abs(roundTrip.percent - 99.9) < 1e-6,
    JSON.stringify(roundTrip),
  );

  const negativeMinutes = percentFromDowntime(-10, "gun");
  check("mənfi dayanma müddəti xəta qaytarır", negativeMinutes.ok === false, JSON.stringify(negativeMinutes));

  const tooLongMinutes = percentFromDowntime(999_999_999, "gun");
  check("dövrdən uzun dayanma müddəti xəta qaytarır", tooLongMinutes.ok === false, JSON.stringify(tooLongMinutes));

  const sequential2 = combineSequential([99.9, 99.9]);
  check(
    "iki ardıcıl 99,9% komponent hər təkbaşınadan aşağı nəticə verir (~99,8%)",
    sequential2 !== null && sequential2 < 99.9 && Math.abs(sequential2 - 99.8001) < 1e-3,
    String(sequential2),
  );

  const perfectSequential = combineSequential([100, 100]);
  check(
    "iki 100% ardıcıl komponent 100% verir (sərhəd)",
    perfectSequential !== null && Math.abs(perfectSequential - 100) < EPS,
    String(perfectSequential),
  );

  const parallel2 = combineParallel([99, 99]);
  check(
    "iki paralel 99% komponent hər təkbaşınadan yuxarı nəticə verir (99,99%)",
    parallel2 !== null && parallel2 > 99 && Math.abs(parallel2 - 99.99) < 1e-6,
    String(parallel2),
  );

  const system = computeSystemAvailability([
    { id: "a", name: "Zəif servis", percent: 99, mode: "ardicil" },
    { id: "b", name: "Güclü servis", percent: 99.99, mode: "ardicil" },
  ]);
  check(
    "sistemin zəif halqası ən aşağı faizli komponentdir",
    system.ok && system.weakestLink.name === "Zəif servis",
    JSON.stringify(system),
  );

  const emptySystem = computeSystemAvailability([]);
  check("boş komponent siyahısı xəta qaytarır", emptySystem.ok === false, JSON.stringify(emptySystem));

  const invalidComponent = computeSystemAvailability([{ id: "a", name: "X", percent: -1, mode: "ardicil" }]);
  check("etibarsız faizli komponent xəta qaytarır", invalidComponent.ok === false, JSON.stringify(invalidComponent));
};
