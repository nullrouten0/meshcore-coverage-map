export async function onRequest(context) {
  var responseData = {
    samples: [
      { id: 0, lat: 47.8033, lon: -122.0427, heard: "2b" },
      { id: 4, lat: 47.8020, lon: -122.1116, heard: null },
      { id: 5, lat: 47.7888, lon: -122.0790, heard: null },
      { id: 6, lat: 47.7720, lon: -122.0799, heard: null },
      { id: 7, lat: 47.7550, lon: -122.0800, heard: null },
      { id: 8, lat: 47.7157, lon: -122.0886, heard: "7e" },
      { id: 9, lat: 47.6769, lon: -122.1061, heard: "68" },
      { id: 11, lat: 47.6690, lon: -122.1296, heard: null },
      { id: 12, lat: 47.6607, lon: -122.1252, heard: null },
      { id: 13, lat: 47.6467, lon: -122.1150, heard: null },
      { id: 14, lat: 47.6423, lon: -122.1257, heard: "26" },
      { id: 16, lat: 47.7608, lon: -122.2048, heard: null },
      { id: 17, lat: 47.7911, lon: -122.2168, heard: null },
      { id: 18, lat: 47.7099, lon: -122.1826, heard: null },
      { id: 19, lat: 47.6334, lon: -122.1883, heard: null }
    ],
    repeaters:[
      { id: 2, pre: "7e", name: "WW7STR/PugetMesh Cougar", lat: 47.54396, lon: -122.10861 },
      { id: 3, pre: "2b", name: "Devils Lake Repeater", lat: 47.80334, lon: -122.04273 },
      { id: 10, pre: "68", name: "Airhack Marymoor", lat: 47.6631, lon: -122.1100 },
      { id: 15, pre: "26", name: "Airhack Overlake", lat: 47.6372, lon: -122.1320 },
      { id: 20, pre: "75", name: "Redmond Powerline Trail", lat: 47.6920, lon: -122.1320 }
    ],
    edges: [
      "0,3",
      "8,2",
      "8,2",
      "9,10",
      "14,15"
    ]};
    
  return new Response(JSON.stringify(responseData));
}
