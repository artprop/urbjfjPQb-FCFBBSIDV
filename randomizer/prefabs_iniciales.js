// Los dos prefabs del usuario (Prefabs/Varon.json y Mujer.json). Se cargan solos la primera vez.
export const PREFABS_INICIALES = [
 {
  "Nombre": "Varón",
  "Prefijo": "M",
  "Modelo": "player/steve",
  "Textura": "64x64",
  "Raiz": "models/player/_LosSaucera",
  "Grupos": [
   {
    "Nombre": "Piel base",
    "Prob": 1,
    "Archivos": [
     "SauceVariantes/02AltVariant.png",
     "SauceVariantes/03AltVariant.png",
     "SauceVariantes/04AltVariant.png",
     "SauceVariantes/05AltVariant.png",
     "SauceVariantes/06AltVariant.png",
     "SauceVariantes/08AltVariant.png",
     "SauceVariantes/09AltVariant.png",
     "SauceVariantes/10AltVariant.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "ninguno",
     "Paleta": [],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Pantalón",
    "Prob": 1,
    "Archivos": [
     "Ropa/VaronStock/Inferior/A8C.png",
     "Ropa/VaronStock/Inferior/A9C.png",
     "Ropa/VaronStock/Inferior/B0C.png",
     "Ropa/VaronStock/Inferior/B1C.png",
     "Ropa/VaronStock/Inferior/B2C.png"
    ],
    "Carpetas": [
     {
      "Ruta": "Ropa/VaronStock/Inferior",
      "Recursivo": false
     }
    ],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "paleta",
     "Paleta": [
      {
       "Hex": "#1F3A6B",
       "Peso": 40
      },
      {
       "Hex": "#101010",
       "Peso": 35
      },
      {
       "Hex": "#4A4A4A",
       "Peso": 15
      },
      {
       "Hex": "#8A7A55",
       "Peso": 10
      }
     ],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Remera / buzo",
    "Prob": 1,
    "Archivos": [
     "Ropa/VaronStock/Superior/A4RemeraC.png",
     "Ropa/VaronStock/Superior/A5BuzoC.png",
     "Ropa/VaronStock/Superior/A6RemeraC.png",
     "Ropa/VaronStock/Superior/A9CamisaC.png",
     "Ropa/VaronStock/Superior/B0CamisaC.png",
     "Ropa/VaronStock/Superior/B1SueterC.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "rgb",
     "Paleta": [],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Zapatillas",
    "Prob": 1,
    "Archivos": [
     "Ropa/Zapats/A3ShoesC.png",
     "Ropa/Zapats/A3ZapatC.png",
     "Ropa/Zapats/A4ZapatC.png",
     "Ropa/Zapats/A5ZapatC.png",
     "Ropa/Zapats/A6ZapatC.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "paleta",
     "Paleta": [
      {
       "Hex": "#5A3A22",
       "Peso": 40
      },
      {
       "Hex": "#E8E8E8",
       "Peso": 35
      },
      {
       "Hex": "#101010",
       "Peso": 25
      }
     ],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Pelo",
    "Prob": 0.8,
    "Archivos": [
     "PelosYMisc/01Pelo.png",
     "PelosYMisc/02Pelo.png",
     "PelosYMisc/03Pelo.png",
     "PelosYMisc/04Pelo.png",
     "PelosYMisc/05Pelo.png",
     "PelosYMisc/06Pelo.png",
     "PelosYMisc/07Pelo.png",
     "PelosYMisc/08Pelo.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "ninguno",
     "Paleta": [],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Saco / chaleco",
    "Prob": 0.15,
    "Archivos": [
     "Ropa/VaronStock/Superior/B2ChalecoC.png",
     "Ropa/VaronStock/Superior/B3ChalecoC.png",
     "Ropa/VaronStock/Superior/A8BCamperaC.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "rgb",
     "Paleta": [],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   }
  ]
 },
 {
  "Nombre": "Mujer",
  "Prefijo": "F",
  "Modelo": "player/alex",
  "Textura": "64x64",
  "Raiz": "models/player/_LosSaucera",
  "Grupos": [
   {
    "Nombre": "Piel base",
    "Prob": 1,
    "Archivos": [
     "SauceVariantes/A1AltVariant.png",
     "SauceVariantes/A2AltVariant.png",
     "SauceVariantes/A3AltVariant.png",
     "SauceVariantes/A4AltVariant.png",
     "SauceVariantes/A6AltVariant.png",
     "SauceVariantes/A7AltVariant.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "ninguno",
     "Paleta": [],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Pantalón",
    "Prob": 1,
    "Archivos": [
     "Ropa/VaronStock/Inferior/A8C.png",
     "Ropa/VaronStock/Inferior/A9C.png",
     "Ropa/VaronStock/Inferior/B0C.png",
     "Ropa/MujerSlim/Inferior/A4ShortC.png",
     "Ropa/MujerSlim/Inferior/A5ShortC.png",
     "Ropa/MujerSlim/Inferior/A6ShortC.png",
     "Ropa/MujerSlim/Inferior/A7ShortC.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "paleta",
     "Paleta": [
      {
       "Hex": "#1F3A6B",
       "Peso": 40
      },
      {
       "Hex": "#101010",
       "Peso": 35
      },
      {
       "Hex": "#6B6B6B",
       "Peso": 15
      },
      {
       "Hex": "#C8B58A",
       "Peso": 10
      }
     ],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Remera / blusa",
    "Prob": 1,
    "Archivos": [
     "Ropa/MujerSlim/Superior/A4RemeraC.png",
     "Ropa/MujerSlim/Superior/A5BuzoC.png",
     "Ropa/MujerSlim/Superior/A6RemeraC.png",
     "Ropa/MujerSlim/Superior/A7MusculosaC.png",
     "Ropa/MujerSlim/Superior/A9CamisaC.png",
     "Ropa/MujerSlim/Superior/B0CamisaC.png",
     "Ropa/MujerSlim/Superior/B1SueterC.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "rgb",
     "Paleta": [],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Zapatillas",
    "Prob": 1,
    "Archivos": [
     "Ropa/Zapats/A1ZapatillasC.png",
     "Ropa/Zapats/A4ZapatC.png",
     "Ropa/Zapats/A5ZapatC.png",
     "Ropa/Zapats/A6ZapatC.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "paleta",
     "Paleta": [
      {
       "Hex": "#5A3A22",
       "Peso": 40
      },
      {
       "Hex": "#E8E8E8",
       "Peso": 35
      },
      {
       "Hex": "#101010",
       "Peso": 25
      }
     ],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Pelo",
    "Prob": 1,
    "Archivos": [],
    "Carpetas": [
     {
      "Ruta": "PelosYMisc/Mujer",
      "Recursivo": false
     }
    ],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "paleta",
     "Paleta": [
      {
       "Hex": "#2B1B12",
       "Peso": 35
      },
      {
       "Hex": "#101010",
       "Peso": 25
      },
      {
       "Hex": "#7A4A24",
       "Peso": 20
      },
      {
       "Hex": "#D9B25F",
       "Peso": 15
      },
      {
       "Hex": "#A8321F",
       "Peso": 5
      }
     ],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   },
   {
    "Nombre": "Saco / chaleco",
    "Prob": 0.15,
    "Archivos": [
     "Ropa/MujerSlim/Superior/B2ChalecoC.png",
     "Ropa/MujerSlim/Superior/A8BCamperaC.png"
    ],
    "Carpetas": [],
    "Excluidos": [],
    "ColoresPropios": {},
    "Color": {
     "Modo": "rgb",
     "Paleta": [],
     "AlfaMin": 128,
     "FijoR": null,
     "FijoG": null,
     "FijoB": null,
     "FijoA": null,
     "GrisMin": 0,
     "GrisMax": 255
    },
    "Erase": false,
    "ShiftY": null
   }
  ]
 }
];
