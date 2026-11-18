(* usage.wl — flatten box-encoded usage messages without a front end.

   A usage message is prose with box islands:
     Plot[f, {x, xmin, xmax}] generates a plot of f ...   (\:f7c1\:f7c9 ... \:f7c0 in between)
   Islands are parsed with ToExpression under HoldComplete (box heads are inert) and
   flattened through a closed whitelist of heads. An unknown head fails instead of
   guessing, and the caller reports degraded = True with the raw string.

   wuUsgText[sym] returns <|"text" -> readable text, "raw" -> the original string,
                           "degraded" -> True when an island could not be flattened|>.

   The wu prefix keeps these helpers away from a session's own symbols: a bare
   `flat` or `text` would collide with Global` symbols on $ContextPath.
*)

$wuInvisible = {
  "\:2060", "\:2061", "\:2062", "\:2063", "\:2064",
  "\:200b", "\:200c", "\:200d", "\:feff", "\:00ad"
};

(* Box escapes are single characters from the private use area, not backslash
   sequences: an island opens with the bang and open-paren characters and closes
   with the close-paren character. Characters gives each as one character. *)
$wuBang = "\:f7c1";
$wuOpen = "\:f7c9";
$wuClose = "\:f7c0";
$wuStar = "\:f7c8";

ClearAll[wuFlat, wuSplit, wuIsland, wuUsgText];
SetAttributes[wuFlat, HoldAllComplete];

wuFlat[RowBox[list_List]] := StringJoin[wuFlat /@ list];
wuFlat[(StyleBox | FormBox | TagBox | AdjustmentBox | TooltipBox | ButtonBox | PaneBox)[body_, ___]] := wuFlat[body];
wuFlat[InterpretationBox[body_, ___]] := wuFlat[body];
wuFlat[SubscriptBox[a_, b_]] := wuFlat[a] <> "_" <> wuFlat[b];
wuFlat[SuperscriptBox[a_, b_]] := wuFlat[a] <> "^" <> wuFlat[b];
wuFlat[SubsuperscriptBox[a_, b_, c_]] := wuFlat[a] <> "_" <> wuFlat[b] <> "^" <> wuFlat[c];
wuFlat[FractionBox[a_, b_]] := wuFlat[a] <> "/" <> wuFlat[b];
wuFlat[SqrtBox[a_]] := "sqrt(" <> wuFlat[a] <> ")";
wuFlat[TemplateBox[args_List, ___]] := StringJoin[wuFlat /@ args];
wuFlat[GridBox[rows_List, ___]] := StringJoin[Riffle[StringJoin[wuFlat /@ #] & /@ rows, " "]];
wuFlat[Cell[body_, ___]] := wuFlat[body];
wuFlat[BoxData[body_]] := wuFlat[body];
wuFlat[s_String] := s;
wuFlat[unknown_] := Throw[Fail[ToString[Head[unknown]]], "usage"];

wuSplit[s_String] := Module[{chars, n, i = 1, out = {}, buf = "", j, depth, body},
  chars = Characters[s];
  n = Length[chars];
  While[i <= n,
    If[chars[[i]] === $wuBang && i + 1 <= n && chars[[i + 1]] === $wuOpen,
      (
        If[buf =!= "", AppendTo[out, {"text", buf}]];
        buf = "";
        j = i + 2;
        depth = 1;
        body = "";
        While[j <= n && depth > 0,
          If[chars[[j]] === $wuOpen,
            (depth++; body = body <> chars[[j]]),
            If[chars[[j]] === $wuClose,
              (depth--; If[depth > 0, body = body <> chars[[j]]]),
              body = body <> chars[[j]]]];
          j++
        ];
        AppendTo[out, {"island", body}];
        i = j
      ),
      (buf = buf <> chars[[i]]; i++)
    ]
  ];
  If[buf =!= "", AppendTo[out, {"text", buf}]];
  out
];

wuIsland[body_String] := Module[{inner, held, result},
  inner = If[StringLength[body] >= 1 && StringTake[body, 1] === $wuStar, StringDrop[body, 1], body];
  held = Quiet@Check[ToExpression[inner, InputForm, HoldComplete], $Failed];
  If[Head[held] =!= HoldComplete, Throw[Fail["unparsable island"], "usage"]];
  result = Catch[Apply[wuFlat, held], "usage"];
  If[Head[result] === Fail, Throw[result, "usage"]];
  If[!StringQ[result], Throw[Fail["island produced no text"], "usage"]];
  result
];

(* The bridge writes JSON to stdout; a non-ASCII character is escaped by the
   kernel as \[Name]/\\ddd, which is not valid JSON. Transliterate by character
   code (escapes, not literals: the source file encoding is not guaranteed) and
   drop whatever is left. *)
wuAscii[s_String] := StringReplace[s, Join[
  Thread[{
    "\:2026", "\:22ef", "\:22ee", "\:22f0", "\:22f1", "\:2024", "\:2025",
    "\:222b", "\:2208", "\:2264", "\:2265", "\:2192", "\:2260", "\:00d7",
    "\:2212", "\:2013", "\:2014", "\:2202", "\:221e", "\:2248", "\:2200"} ->
   {"...", "...", "...", "...", "...", "...", "...",
    "Integral ", " in ", "<=", ">=", "->", "!=", "x",
    "-", "-", "-", "d", "Infinity", "~", "for all "}],
  {RegularExpression["[^\\x00-\\x7F]"] -> ""}
]];

wuUsgText[sym_Symbol] := Module[{raw, parts, pieces, result, degraded = False},
  raw = Quiet@Check[MessageName[sym, "usage"], $Failed];
  If[!StringQ[raw] || StringTrim[raw] === "",
    Return[<|"text" -> "", "raw" -> "", "degraded" -> True|>]];
  parts = Quiet@Check[wuSplit[raw], $Failed];
  If[parts === $Failed, Return[<|"text" -> "", "raw" -> raw, "degraded" -> True|>]];
  pieces = Map[
    Function[part,
      If[part[[1]] === "text",
        part[[2]],
        Module[{piece = Quiet@Check[Catch[wuIsland[part[[2]]], "usage"], $Failed]},
          If[StringQ[piece], piece, (degraded = True; "")]]]],
    parts];
  result = StringJoin[pieces];
  result = StringReplace[result, Thread[$wuInvisible -> ""]];
  result = StringTrim@StringReplace[result, WhitespaceCharacter .. -> " "];
  (* Typesetting puts a space after a comma; a linear reading needs it too. *)
  result = StringReplace[result, RegularExpression[",(?=\\S)"] -> ", "];
  <|"text" -> wuAscii[result], "raw" -> raw, "degraded" -> degraded|>
];
