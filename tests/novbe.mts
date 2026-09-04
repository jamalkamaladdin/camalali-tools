import type { CheckSuite } from "./harness.mts";
import { computeQueue, erlangCWaitProbability } from "../lib/novbe";

const EPS = 1e-6;

export const checks: CheckSuite = (check) => {
  const mm1 = computeQueue({ arrivalRate: 8, serviceTimeMs: 100, servers: 1 });
  check("λ=8, μ=10 (xidmət 100ms) → ρ=0,8", mm1.ok && mm1.stable && Math.abs(mm1.rho - 0.8) < EPS, JSON.stringify(mm1));
  check(
    "M/M/1 üçün Lq=ρ²/(1-ρ)=3,2",
    mm1.ok && mm1.stable && Math.abs(mm1.queueLength - 3.2) < 1e-9,
    JSON.stringify(mm1),
  );
  check(
    "M/M/1 üçün Wq=400ms, W=500ms",
    mm1.ok && mm1.stable && Math.abs(mm1.queueWaitSec - 0.4) < 1e-9 && Math.abs(mm1.systemTimeSec - 0.5) < 1e-9,
    JSON.stringify(mm1),
  );

  const exactlyOne = computeQueue({ arrivalRate: 10, serviceTimeMs: 100, servers: 1 });
  check(
    "ρ=1 olanda növbə sabitləşmir, rəqəm hesablanmır (sərhəd)",
    exactlyOne.ok && exactlyOne.stable === false,
    JSON.stringify(exactlyOne),
  );

  const overOne = computeQueue({ arrivalRate: 11, serviceTimeMs: 100, servers: 1 });
  check("ρ>1 olanda da növbə sabitləşmir", overOne.ok && overOne.stable === false, JSON.stringify(overOne));

  const negativeArrival = computeQueue({ arrivalRate: -1, serviceTimeMs: 100, servers: 1 });
  check("mənfi gəliş sürəti xəta qaytarır, throw etmir", negativeArrival.ok === false, JSON.stringify(negativeArrival));

  const zeroService = computeQueue({ arrivalRate: 5, serviceTimeMs: 0, servers: 1 });
  check("sıfır xidmət vaxtı xəta qaytarır", zeroService.ok === false, JSON.stringify(zeroService));

  const fractionalServers = computeQueue({ arrivalRate: 5, serviceTimeMs: 100, servers: 2.5 });
  check("tam olmayan server sayı xəta qaytarır", fractionalServers.ok === false, JSON.stringify(fractionalServers));

  const zeroServers = computeQueue({ arrivalRate: 5, serviceTimeMs: 100, servers: 0 });
  check("sıfır server xəta qaytarır", zeroServers.ok === false, JSON.stringify(zeroServers));

  check(
    "Little qanunu: L = λW həmişə doğrudur (M/M/1)",
    mm1.ok && mm1.stable && Math.abs(mm1.systemLength - mm1.rho / (1 - mm1.rho)) < 1e-9,
    JSON.stringify(mm1),
  );

  // Independently cross-checked against the direct a^k/k! form of Erlang C
  // for c=5, a=3 (λ=3, μ=1 req/s/server): P(wait) ≈ 0.2361516, Lq ≈ 0.3542274.
  const mmc = computeQueue({ arrivalRate: 3, serviceTimeMs: 1_000, servers: 5 });
  check(
    "M/M/c (λ=3, μ=1, c=5) → ρ=0,6",
    mmc.ok && mmc.stable && Math.abs(mmc.rho - 0.6) < EPS,
    JSON.stringify(mmc),
  );
  check(
    "M/M/c Erlang C nəticəsi müstəqil hesablanmış dəyərlə üst-üstə düşür (Lq≈0,3542274)",
    mmc.ok && mmc.stable && Math.abs(mmc.queueLength - 0.35422740524781327) < 1e-9,
    JSON.stringify(mmc),
  );
  check(
    "Little qanunu M/M/c üçün də doğrudur (L = λW, λ=3)",
    mmc.ok && mmc.stable && Math.abs(mmc.systemLength - 3 * mmc.systemTimeSec) < 1e-9,
    JSON.stringify(mmc),
  );

  check(
    "erlangCWaitProbability(5,3) müstəqil hesablanmış dəyərə bərabərdir",
    Math.abs(erlangCWaitProbability(5, 3) - 0.23615160349854222) < 1e-9,
    String(erlangCWaitProbability(5, 3)),
  );
};
