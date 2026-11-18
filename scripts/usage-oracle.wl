(* Compare the box flattener (usage.wl) against the front end.

   The front end renders boxes exactly as Mathematica shows them; the flattener must
   reproduce that text without a GUI. Run this script when changing usage.wl:

       math -script scripts/usage-oracle.wl

   or through the agent's wolfram_job. Output: one line per symbol, DIFF lines carry
   the first mismatching fragment of both texts. Exit code is not set (WL scripts do
   not have one); the last line summarises the counts.
*)

repo = DirectoryName[DirectoryName[$InputFileName]];
Get[FileNameJoin[{repo, "usage.wl"}]];

syms = {
  Plot, Plot3D, ListPlot, Integrate, NIntegrate, NDSolve, DSolve,
  FindRoot, Solve, Eliminate, Dataset, Quantity, Graph, Manipulate,
  Print, Table, Map, Series, ComplexExpand, Fourier
};

usageBoxes[sym_] := Module[{parts, out},
  parts = wuSplit[MessageName[sym, "usage"]];
  out = Map[
    Function[part,
      If[part[[1]] === "text", part[[2]],
        Module[{inner, held},
          inner = If[StringLength[part[[2]]] >= 1 && StringTake[part[[2]], 1] === $wuStar,
            StringDrop[part[[2]], 1], part[[2]]];
          held = Quiet@Check[ToExpression[inner, InputForm, HoldComplete], $Failed];
          If[Head[held] === HoldComplete, First[held], ""]]]],
    parts];
  RowBox[out]
];

feText[sym_] := Module[{result},
  result = Quiet@Check[
    FrontEndExecute[FrontEnd`ExportPacket[Cell[BoxData[usageBoxes[sym]]], "InputText"]],
    $Failed];
  If[ListQ[result] && StringQ[First[result]], First[result], $Failed]
];

flatText[sym_] := Quiet@Check[wuAscii[wuUsgText[sym]["text"]], $Failed];

normalize[s_String] := StringReplace[s, WhitespaceCharacter .. -> ""];

(* The front end linearizes boxes: Subscript[x, min] rather than x_min, and the
   ellipsis character rather than "...". Rewrite those to the flattener's shape so
   the comparison is about content, not about which notation was chosen. *)
feNormalize[s_String] := Module[{t},
  t = s;
  t = StringReplace[t, RegularExpression["Subscript\\[([^,\\]]+),\\s*([^\\]]+)\\]"] -> "$1_$2"];
  t = StringReplace[t, RegularExpression["Superscript\\[([^,\\]]+),\\s*([^\\]]+)\\]"] -> "$1^$2"];
  t = StringReplace[t, "\\[Ellipsis]" -> "..."];
  t = StringReplace[t, "\\[InvisibleSpace]" -> ""];
  normalize[wuAscii[t]]
];

compare[sym_] := Module[{fe, flat, a, b, fragment},
  fe = feText[sym];
  flat = flatText[sym];
  If[!StringQ[fe], Return[{"NO-FE", SymbolName[sym], "", ""}]];
  If[!StringQ[flat], Return[{"NO-FLAT", SymbolName[sym], "", ""}]];
  a = feNormalize[fe];
  b = normalize[flat];
  fragment[str_] := StringTake[str, UpTo[120]];
  If[a === b, {"OK", SymbolName[sym], "", ""},
    {"DIFF", SymbolName[sym], fragment[flat], fragment[fe]}]
];

results = UsingFrontEnd[Map[compare, syms]];

Scan[
  Function[r,
    If[r[[1]] === "OK",
      Print[r[[1]], " ", r[[2]]],
      Print[r[[1]], " ", r[[2]], " | flat: ", r[[3]], " | fe: ", r[[4]]]]],
  results];

Print["SUMMARY ok=", Count[results, {"OK", __}],
  " diff=", Count[results, {"DIFF", __}],
  " nofe=", Count[results, {"NO-FE", __}],
  " noflat=", Count[results, {"NO-FLAT", __}]];
