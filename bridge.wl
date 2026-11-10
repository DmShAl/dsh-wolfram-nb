(* Wolfram Language bridge for DeepSeek Harness.
   Protocol: one request per stdin line.
     WolframBridge`Eval["<base64 of UTF-8 JSON request>"]
   Output on stdout:
     @@WB_BEGIN@@<id>
     ... console output produced while evaluating the request ...
     @@WB_DOC@@<id>@@<base64 of UTF-8 JSON document>
*)

WolframBridge`$version = "1.3.0";
WolframBridge`$timedOut = WolframBridge`TimedOut;
WolframBridge`$maxInputForm = 40000;
WolframBridge`$cellTimeout = 300;
WolframBridge`$imageTimeout = 30;

WolframBridge`decode[text_String] := ByteArrayToString[BaseDecode[text], "UTF-8"];

WolframBridge`encode[text_String] := BaseEncode[StringToByteArray[text, "ISO8859-1"]];

WolframBridge`toJson[value_] := ExportString[value, "JSON"];

WolframBridge`send[tag_String, id_String, payload_String] :=
  WriteString["stdout", tag, id, "@@", payload, "\n"];

WolframBridge`limit[text_String, max_Integer] :=
  If[StringLength[text] > max, StringTake[text, max] <> "...[truncated]", text];

WolframBridge`safeString[value_, fallback_String] :=
  Quiet@Check[If[StringQ[value], value, ToString[value, InputForm]], fallback];

WolframBridge`graphicQ[value_] :=
  ! FreeQ[value, _Graphics | _Graphics3D | _GraphicsComplex | _Legended |
      _GraphicsRow | _GraphicsGrid | _GraphicsColumn, {0, 3}];

WolframBridge`imageQ[value_] := Head[value] === Image || Head[value] === Image3D;

WolframBridge`exportImage[value_] := Module[{png},
  png = Quiet@Check[
    TimeConstrained[ExportString[value, "PNG"], WolframBridge`$imageTimeout, $Failed],
    $Failed];
  If[StringQ[png] && StringLength[png] > 0,
    BaseEncode[StringToByteArray[png, "ISO8859-1"]],
    $Failed]
];

WolframBridge`expressionRecord[index_Integer, value_, timing_Integer] := Module[
  {inputForm, mathml, tex},
  inputForm = WolframBridge`safeString[
    Quiet@Check[ToString[value, InputForm], "$Failed"], "$Failed"];
  mathml = Quiet@Check[
    TimeConstrained[ExportString[value, "MathML"], 10, ""], ""];
  tex = Quiet@Check[
    TimeConstrained[ToString[TeXForm[value]], 10, ""], ""];
  <|"index" -> index, "kind" -> "expression", "timingMs" -> timing,
    "inputForm" -> WolframBridge`limit[inputForm, WolframBridge`$maxInputForm],
    "mathml" -> If[StringQ[mathml], mathml, ""],
    "tex" -> If[StringQ[tex], tex, ""]|>
];

WolframBridge`imageRecord[index_Integer, value_, timing_Integer] := Module[{image},
  image = WolframBridge`exportImage[value];
  <|"index" -> index, "kind" -> "image", "timingMs" -> timing,
    "image" -> If[StringQ[image], image, ""],
    "imageError" -> If[StringQ[image], "", "Image export failed"]|>
];

WolframBridge`graphicsRecord[index_Integer, value_, timing_Integer] := Module[{image},
  image = WolframBridge`exportImage[value];
  <|"index" -> index, "kind" -> "graphics", "timingMs" -> timing,
    "image" -> If[StringQ[image], image, ""],
    "graphicsFailed" -> ! StringQ[image],
    "inputForm" -> WolframBridge`limit[
      WolframBridge`safeString[value, ""], 4000]|>
];

(* A top-level Sequence would splice into every association built from it and
   break the JSON export, so keep the value as one inert expression. *)
WolframBridge`plainValue[value_] := Module[{head},
  head = Head[Unevaluated[value]];
  If[head === Sequence, List @@ Unevaluated[value], value]
];

WolframBridge`cellRecord[index_Integer, value_, timing_Integer] := Module[
  {plain = WolframBridge`plainValue[value]},
  Which[
    WolframBridge`imageQ[plain], WolframBridge`imageRecord[index, plain, timing],
    WolframBridge`graphicQ[plain], WolframBridge`graphicsRecord[index, plain, timing],
    plain === Null, <|"index" -> index, "kind" -> "null", "timingMs" -> timing|>,
    True, WolframBridge`expressionRecord[index, plain, timing]
  ]
];

(* One cell may hold several top-level expressions (separated by `;` or newlines).
   ToExpression then returns HoldComplete[e1, e2, ...]; wrapping them in one
   CompoundExpression keeps ReleaseHold from producing a bare Sequence. *)
WolframBridge`holdCell[code_String] := Module[{held},
  held = Quiet@Check[ToExpression[code, InputForm, HoldComplete], $Failed];
  If[Head[held] =!= HoldComplete, Return[$Failed]];
  Which[
    Length[held] === 0, HoldComplete[Null],
    Length[held] === 1, held,
    True, Replace[held,
      HoldComplete[expressions__] :> HoldComplete[CompoundExpression[expressions]]]
  ]
];

WolframBridge`evalCell[cell_, {index_Integer}] := Module[
  {code, held, value, started, timing, type},
  type = Lookup[cell, "type", "input"];
  code = Lookup[cell, "code", ""];
  If[! MemberQ[{"input", "code"}, type],
    Return[<|"type" -> type, "source" -> code,
      "text" -> Lookup[cell, "text", ""],
      "record" -> <|"index" -> index, "kind" -> "text", "timingMs" -> 0,
        "text" -> Lookup[cell, "text", ""]|>|>]
  ];
  started = AbsoluteTime[];
  held = WolframBridge`holdCell[code];
  If[held === $Failed,
    Return[<|"type" -> Lookup[cell, "type", "input"], "source" -> code,
      "text" -> Lookup[cell, "text", ""],
      "record" -> <|"index" -> index, "kind" -> "parseError", "timingMs" -> 0|>|>]
  ];
  value = TimeConstrained[ReleaseHold[held], WolframBridge`$cellTimeout,
    WolframBridge`$timedOut];
  timing = Round[(AbsoluteTime[] - started)*1000];
  If[value === WolframBridge`$timedOut,
    Return[<|"type" -> Lookup[cell, "type", "input"], "source" -> code,
      "text" -> Lookup[cell, "text", ""],
      "record" -> <|"index" -> index, "kind" -> "timedOut", "timingMs" -> timing|>|>]
  ];
  <|"type" -> Lookup[cell, "type", "input"], "source" -> code,
    "text" -> Lookup[cell, "text", ""], "expr" -> value,
    "record" -> WolframBridge`cellRecord[index, value, timing]|>
];

WolframBridge`cellToNotebook[item_] := Module[{type, text, value},
  type = item["type"];
  text = item["text"];
  value = item["expr"];
  Switch[type,
    "title", Cell[text, "Title"],
    "section", Cell[text, "Section"],
    "subsection", Cell[text, "Subsection"],
    "text", Cell[text, "Text"],
    "code", Cell[text, "Code"],
    _,
      {Cell[item["source"], "Input"],
       If[Head[value] === Symbol && value === $Failed,
         Nothing,
         Cell[BoxData[Quiet@Check[ToBoxes[value, StandardForm], ""]], "Output"]]}
  ]
];

WolframBridge`buildNotebook[title_String, items_List] := Module[{cells},
  cells = If[StringLength[title] > 0, {Cell[title, "Title"]}, {}];
  Do[cells = Join[cells, Flatten[{WolframBridge`cellToNotebook[item]}]], {item, items}];
  Notebook[cells]
];

WolframBridge`exportNotebook[request_, items_] := Module[{nbPath, notebook, result},
  nbPath = Lookup[request, "nbPath", Null];
  If[! StringQ[nbPath] || StringLength[nbPath] == 0, Return[<||>]];
  notebook = Quiet@Check[
    WolframBridge`buildNotebook[Lookup[request, "title", ""], items], $Failed];
  If[Head[notebook] =!= Notebook,
    Return[<|"nbPath" -> nbPath, "nbError" -> "Notebook construction failed"|>]];
  result = Quiet@Check[Export[nbPath, notebook, "NB"], $Failed];
  <|"nbPath" -> nbPath, "nbError" -> If[result === $Failed,
    "Notebook export failed", ""]|>
];

WolframBridge`failRequest[detail_String] := Module[{},
  WriteString["stdout", "@@WB_BEGIN@@0\n"];
  WolframBridge`send["@@WB_DOC@@", "0",
    WolframBridge`encode[WolframBridge`toJson[
      <|"id" -> "0", "error" -> "Malformed request", "detail" -> detail|>]]]
];

WolframBridge`normalize[(rule : Rule | RuleDelayed)[key_, value_]] :=
  key -> WolframBridge`normalize[value];

WolframBridge`normalize[value_List] := Module[{mapped},
  mapped = Map[WolframBridge`normalize, value];
  If[mapped =!= {} && MatchQ[mapped, {(_Rule | _RuleDelayed) ..}],
    Association[mapped],
    mapped]
];

WolframBridge`normalize[value_Association] :=
  Association[Map[WolframBridge`normalize, Normal[value]]];

WolframBridge`normalize[value_] := value;

WolframBridge`publish[request_, document_] := Module[
  {payload, responsePath, id, json},
  id = Lookup[request, "id", "0"];
  json = Quiet@Check[WolframBridge`toJson[document], $Failed];
  If[! StringQ[json],
    json = WolframBridge`toJson[<|
      "id" -> id,
      "kernelVersion" -> $Version,
      "title" -> Lookup[request, "title", ""],
      "cells" -> {},
      "error" -> "The result could not be serialized as JSON."|>]
  ];
  payload = WolframBridge`encode[json];
  responsePath = Lookup[request, "respPath", ""];
  If[StringQ[responsePath] && StringLength[responsePath] > 0,
    Export[responsePath, payload, "Text"];
    WolframBridge`send["@@WB_DOC@@", id, responsePath]
    ,
    WolframBridge`send["@@WB_DOC@@", id, payload]
  ];
  Null
];

WolframBridge`boxText[content_] := Quiet@Check[
  StringJoin[Cases[content, _String, {0, Infinity}]], ""];

WolframBridge`mathmlOf[content_] := Quiet@Check[
  TimeConstrained[ExportString[content, "MathML"], 8, ""], ""];

WolframBridge`notebookStyle[cell_Cell] := Module[{style},
  style = Quiet@Check[cell[[2]], "Input"];
  If[StringQ[style], style, "Input"]
];

WolframBridge`limitText[text_String, max_Integer] :=
  If[StringLength[text] > max, StringTake[text, max] <> "...[truncated]", text];

WolframBridge`graphicsValue[content_] := Module[{boxes, held, found},
  boxes = If[Head[content] === BoxData, First[content], content];
  held = Quiet@Check[MakeExpression[boxes, StandardForm], $Failed];
  If[Head[held] =!= HoldComplete, Return[Null]];
  found = Quiet@Check[
    Cases[held, graphic : (_Graphics | _Graphics3D | _Legended) :> graphic,
      {0, Infinity}],
    {}];
  If[ListQ[found] && Length[found] > 0, First[found], Null]
];

WolframBridge`notebookCellRecord[cell_Cell, {index_Integer}] := Module[
  {style, content, kind, cellType, text, mathml, image, graphics},
  style = WolframBridge`notebookStyle[cell];
  content = If[Length[cell] >= 1, cell[[1]], ""];
  kind = Switch[style,
    "Title" | "Chapter" | "Section" | "Subsection" | "Subsubsection" |
      "Subchapter" | "Text" | "Item" | "ItemParagraph" | "Caption", "text",
    "Input" | "Code" | "Program" | "InputText", "input",
    _, "expression"];
  cellType = Switch[style,
    "Title" | "Chapter", "title",
    "Section" | "Subsection" | "Subsubsection" | "Subchapter", "section",
    "Input" | "Code" | "Program" | "InputText", "input",
    _, "text"];
  text = WolframBridge`boxText[content];
  mathml = "";
  image = $Failed;
  If[kind === "expression",
    graphics = WolframBridge`graphicsValue[content];
    If[graphics =!= Null,
      image = WolframBridge`exportImage[graphics];
      kind = "graphics",
      mathml = WolframBridge`mathmlOf[content]
    ]
  ];
  <|"index" -> index, "kind" -> kind, "style" -> style,
    "cellType" -> cellType,
    "text" -> If[kind === "graphics", "", WolframBridge`limitText[text, 4000]],
    "source" -> If[kind === "input", WolframBridge`limitText[text, 20000], ""],
    "mathml" -> If[StringQ[mathml], mathml, ""],
    "image" -> If[StringQ[image], image, ""],
    "graphicsFailed" -> (kind === "graphics" && ! StringQ[image]),
    "inputForm" -> If[kind === "expression" && ! StringQ[mathml],
      WolframBridge`limitText[text, 2000], ""],
    "timingMs" -> 0|>
];

WolframBridge`openNotebookDocument[path_String] := Module[{notebook, cells},
  notebook = Quiet@Check[Import[path], $Failed];
  If[Head[notebook] =!= Notebook,
    Return[<|"error" -> "Cannot read this notebook file",
      "sourcePath" -> path, "cells" -> {}, "id" -> FileBaseName[path]|>]];
  (* Mathematica groups input/output pairs in CellGroupData, and may nest groups. *)
  cells = Cases[First[notebook], _Cell, {0, Infinity}];
  cells = DeleteCases[cells, Cell[CellGroupData[___], ___]];
  <|"id" -> FileBaseName[path], "kernelVersion" -> $Version,
    "title" -> FileBaseName[path], "sourcePath" -> path,
    "cells" -> MapIndexed[WolframBridge`notebookCellRecord, cells],
    "timingMs" -> 0|>
];

WolframBridge`run[request_] := Module[
  {id, items, document, notebookInfo},
  id = Lookup[request, "id", "0"];
  WriteString["stdout", "@@WB_BEGIN@@", id, "\n"];
  items = MapIndexed[WolframBridge`evalCell, Lookup[request, "cells", {}]];
  document = <|
    "id" -> id,
    "kernelVersion" -> $Version,
    "title" -> Lookup[request, "title", ""],
    "timingMs" -> 0,
    "cells" -> Map[
      Function[item, Join[item["record"],
        <|"cellType" -> item["type"], "source" -> item["source"]|>]],
      items]
  |>;
  notebookInfo = WolframBridge`exportNotebook[request, items];
  document = Join[document, notebookInfo];
  document = Join[document, <|"input" -> Lookup[request, "cells", {}]|>];
  WolframBridge`publish[request, document]
];

WolframBridge`EvalFile[path_String] := Module[{text, request, action},
  text = Quiet@Check[Import[path, "Text", CharacterEncoding -> "UTF-8"], ""];
  request = Quiet@Check[
    WolframBridge`normalize[ImportString[text, "JSON"]], $Failed];
  If[! AssociationQ[request],
    WolframBridge`failRequest[
      "read=" <> ToString[StringLength[text]] <> " head=" <>
        StringTake[text, UpTo[120]]];
    Return[Null]];
  action = Lookup[request, "action", "eval"];
  If[action === "open",
    WriteString["stdout", "@@WB_BEGIN@@", Lookup[request, "id", "0"], "\n"];
    WolframBridge`publish[request,
      WolframBridge`openNotebookDocument[Lookup[request, "srcPath", ""]]];
    Return[Null]];
  WolframBridge`run[request]
];

WolframBridge`Eval[base64_String] := Module[{request},
  request = Quiet@Check[
    ImportString[WolframBridge`decode[base64], "JSON"], $Failed];
  If[! AssociationQ[request], WolframBridge`failRequest["inline"]; Return[Null]];
  WolframBridge`run[request]
];

WolframBridge`Ready[] := Module[{},
  WriteString["stdout", "@@WB_READY@@", WolframBridge`$version, "|", $Version, "\n"];
  Null
];
