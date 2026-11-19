(* ============================================================================
   heavy_tail.wl — robust diagnostics for heavy-tailed samples.

   Load:  Get["<workspace>\\tools\\heavy_tail.wl"]

   Avoids KDE on raw heavy tails. Provides:
     HeavyTailPoints[data]        empirical |X|-survival on log-spaced order stats
     HeavyTailPlot[data]          log-log survival with binomial bands
     HeavyTailSlope[data, frac]   tail slope via log-log regression
     HeavyTailLogDensity[data]    log-binned density (counts / bin width)

   All functions use Abs[data]; for a one-sided positive sample this is the
   right tail. Bands are pointwise binomial (not simultaneous).
   ============================================================================ *)

ClearAll[HeavyTailPoints, HeavyTailPlot, HeavyTailSlope, HeavyTailLogDensity];

Options[HeavyTailPlot] = {
  PlotPoints -> 30, ConfidenceLevel -> 0.95, Joined -> True,
  ImageSize -> 700, PlotLabel -> "Heavy-tail survival", FrameLabel -> Automatic
};

HeavyTailPoints[data_?VectorQ, npts_Integer : 30] := Module[
  {x = Sort[Abs[N[data]]], n = Length[data], idx},
  idx = Union[Round[Exp[Range[Log[Max[2, n/2]], Log[n - 1],
     (Log[n - 1] - Log[Max[2, n/2]])/(npts - 1)]]]];
  idx = Select[idx, 2 <= # <= n - 1 &];
  Table[{x[[idx[[k]]]], 1 - idx[[k]]/n}, {k, Length[idx]}]
  ];

HeavyTailPlot[data_?VectorQ, opts : OptionsPattern[]] := Module[
  {pts, n = Length[data], z, lower, upper, level = OptionValue[ConfidenceLevel]},
  pts = HeavyTailPoints[data, OptionValue[PlotPoints]];
  z = Quantile[NormalDistribution[0, 1], 1 - (1 - level)/2];
  lower = {#[[1]], Max[10^-12, #[[2]] - z Sqrt[#[[2]] (1 - #[[2]])/n]]} & /@ pts;
  upper = {#[[1]], Min[1., #[[2]] + z Sqrt[#[[2]] (1 - #[[2]])/n]]} & /@ pts;
  ListLogLogPlot[{pts, lower, upper}, Joined -> {True, False, False},
    Filling -> {2 -> {3}}, PlotStyle -> {Directive[Thick, Blue],
      Directive[Thin, Gray], Directive[Thin, Gray]},
    Frame -> True,
    FrameLabel -> If[OptionValue[FrameLabel] === Automatic,
      {"|x|", "P(|X| > |x|)"}, OptionValue[FrameLabel]],
    PlotLabel -> OptionValue[PlotLabel],
    ImageSize -> OptionValue[ImageSize],
    PlotLegends -> {"empirical survival", "95% band"}]
  ];

HeavyTailSlope[data_?VectorQ, frac_Real : 0.1] := Module[
  {x = Sort[Abs[N[data]]], n = Length[data], k, keep, fit},
  k = Max[10, Round[frac n]];
  keep = Reverse[Take[x, -k]];
  fit = LinearModelFit[Transpose[{Log[keep], Log[Range[1, k]/n]}], {1, u}, u];
  fit["BestFitParameters"][[2]]
  ];

HeavyTailLogDensity[data_?VectorQ, bins_Integer : 24] := Module[
  {x = Sort[Abs[N[data]]], n = Length[data], xmin, xmax, edges, counts, centers, widths},
  xmin = Quantile[x, 0.5];
  xmax = Max[x];
  If[xmax <= xmin, Return[{}]];
  edges = Exp[Range[Log[xmin], Log[xmax], (Log[xmax] - Log[xmin])/bins]];
  counts = BinCounts[Log[x], {Log[xmin], Log[xmax], (Log[xmax] - Log[xmin])/bins}];
  centers = (Most[edges] + Rest[edges])/2;
  widths = Rest[edges] - Most[edges];
  Transpose[{centers, counts/(n widths)}]
  ];
