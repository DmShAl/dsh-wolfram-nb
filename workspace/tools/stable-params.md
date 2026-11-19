# Параметризации устойчивых распределений

Короткая шпаргалка, чтобы не смешивать Mathematica, scipy и «лапласовскую» нормировку.

## 1. Какая параметризация где

| Система | Запись | Параметризация |
|---|---|---|
| Mathematica | `StableDistribution[1, α, β, μ, σ]` | type **1**; при `β=0, μ=0, σ=1` CF $e^{-|t|^\alpha}$ |
| scipy | `levy_stable(alpha=α, beta=β, loc=μ, scale=σ)` | по умолчанию **S1** |
| «лапласовская» | $E e^{-sX}=e^{-s^\alpha}$ | положительная stable, **другой масштаб** |

Для `α<1`, `β=1` (positive stable) type1/S1 имеет CF
$$
E e^{itX}=\exp\!\left(-|t|^\alpha
\left(1-i\tan\frac{\pi\alpha}{2}\,\operatorname{sgn}t\right)\right).
$$
`StableDistribution[0, ...]` — это **S0**, не S1; не подставляйте её в формулы ниже.

## 2. Масштаб positive stable

S1-версия имеет преобразование Лапласа
$$
E e^{-sX_{S1}}=\exp\!\left(-\frac{s^\alpha}{\cos(\pi\alpha/2)}\right).
$$
«Лапласовская» версия $X_{\mathrm{Lap}}$ определяется как $E e^{-sX_{\mathrm{Lap}}}=e^{-s^\alpha}$.
Связь:
$$
X_{\mathrm{Lap}}=c\,X_{S1},\qquad
c=\left(\cos\frac{\pi\alpha}{2}\right)^{1/\alpha}.
$$
Примеры: $\alpha=0.5$: $c=1/2$; $\alpha=0.7$: $c\approx0.32364$;
$\alpha=0.9$: $c\approx0.12730$.

## 3. Моменты

Для $0<p<\alpha$ (и для отрицательных $p$, где интеграл сходится):
$$
E X_{\mathrm{Lap}}^p=\frac{\Gamma(1-p/\alpha)}{\Gamma(1-p)},
\qquad
E X_{S1}^p=\frac{1}{c^p}\frac{\Gamma(1-p/\alpha)}{\Gamma(1-p)}.
$$
Для $Y=X\cos\Theta$:
$$
E|Y|^p=E X^p\,\frac{\Gamma((p+1)/2)}{\sqrt\pi\,\Gamma((p+2)/2)},
\qquad
f_Y(0)=\frac{E(1/X)}{\pi}.
$$
В S1:
$$
f_Y(0)=\frac{c}{\pi}\Gamma\!\left(1+\frac1\alpha\right).
$$
Проверка $\alpha=0.5$, $p=0.25$: $E X_{S1}^{0.25}=1.7201$,
$E|Y|^{0.25}=1.7201\cdot0.8594=1.4782$ — совпадает с МК из
`04-positive-stable-projection`.

## 4. Медленная плотность: сначала таблица

`Plot[PDF[StableDistribution[...], x]]` с `NIntegrate` внутри может считаться минутами.
Делайте таблицу/интерполяцию **до** `Plot`:

```wl
grid = Exp[Range[Log[10^-3], Log[20], (Log[20] - Log[10^-3])/200]];
tab = Table[{x, PDF[dist, x]}, {x, grid}];
f = Interpolation[tab, InterpolationOrder -> 3];
Plot[f[x], {x, 0, 10}]
```

Если нужен только хвост — используйте `tools/heavy_tail.wl`, без KDE.
