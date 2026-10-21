/* Shadow Crown: Living World, Book 1 (Zeke's Daydream).
   Edit this file to change characters, places, missions, dialogue and collectibles.
   Story lines marked "game text" were written for the game and can be rewritten to match the book. */
window.SC_DATA = {
  book: {
    title: "Shadow Crown: Zeke's Daydream", series: "Book 1", author: "Jabari J. Bailey",
    isbn: "9798171324193", amazon: "https://www.amazon.com/dp/B0HJZFTWF4", instagram: "https://www.instagram.com/shadowcrown.ent/",
    blurb: "Step into the beginning of the Shadow Crown Universe. Zeke sees glimpses of tomorrow in his dreams, but every vision costs something. With Prince by his side and the Upendo family behind him, he has to decide what's worth changing."
  },
  families: [
    { id: "upendo", name: "The Upendo Family", motto: "Familia ya Mungu", members: ["zeke", "prince", "zora", "kingston", "krystal", "zavian"] },
    { id: "dixon", name: "The Dixons", motto: "Friends of the family", members: ["shawn", "marcus", "ajay", "keisha", "berry"] }
  ],
  chars: {
    zeke: { name: "Zeke", age: 10, title: "Prophet · Dreamer · Protector", role: "The Prophet", ability: "Future sight through dreams",
      about: "Zeke sees glimpses of the future through dreams, and sometimes in flashes while awake. His power depends on the strength of his mental health: when his mind is clear he sees more; stress, anxiety and overload cloud the future. Migraines warn him a vision is close.",
      personality: "Introvert. Observant. Private.", quote: "I don't just see the future… I protect it.",
      facts: ["Loves drawing and sketching dreams", "Keeps a dream journal", "Enjoys quiet places and rooftops", "Favorite food: mac & cheese", "Secretly has a sweet tooth"],
      stats: { Focus: 78, Stamina: 64, Vision: 92, Confidence: 58 }, sheet: "sc-zeke", pic: "p-zeke" },
    prince: { name: "Prince", age: null, title: "Best friend & protector", role: "Zeke's companion", ability: "Extra eyes, ears and a nose for danger",
      about: "Prince is Zeke's best friend and travels with him everywhere. When Zeke's mind gets heavy, they walk, Zeke talks and Prince listens. It clears his head.",
      quote: "", facts: ["Goes everywhere with Zeke", "Wears a crown on his collar"], stats: { Loyalty: 100, Senses: 95, Calm: 88 }, pic: "p-prince" },
    zora: { name: "Zora", age: 8, title: "Sister", role: "The Heart", ability: "Water bending",
      about: "Zora is the sparkle of the family. She loves fashion, music and making everything around her beautiful, and she's a fierce competitor who stays in motion. She can shape, lift and redirect water, and her power grows with her emotions.",
      personality: "Girly · Energetic · Athletic", quote: "Pretty, powerful, and I move like water.",
      facts: ["Loves purple, glitter & lip gloss", "Dreams of being a fashion designer and Olympian", "Practices dance to control her flow"],
      stats: { Power: 80, Speed: 86, Control: 62, Joy: 98 }, sheet: "sc-zora", pic: "p-zora" },
    kingston: { name: "Kingston", age: 16, title: "Brother", role: "Aspiring sound engineer", ability: "None. His mind is his greatest weapon.",
      about: "While the rest of the family has extraordinary gifts, Kingston is the realist who keeps everyone grounded. He's an upcoming sound engineer with an ear for greatness. No powers. Just purpose.",
      personality: "Loyal · Dependable · Calm under pressure", quote: "I don't need powers to make an impact. I just need the right sound.",
      facts: ["Collects vinyl records", "Can name any song in 3 seconds", "Plays guitar & keys", "Dreams of owning a world-class studio"],
      stats: { Hearing: 97, Tech: 90, Grit: 85, Chill: 80 }, sheet: "sc-kingston", pic: "p-kingston" },
    krystal: { name: "Krystal", age: 38, title: "Mother · Designer · Healer", role: "Florist · Designer · Nature connector", ability: "Nature connection",
      about: "Krystal can hear Mother Nature. Plants, soil, weather and the smallest creatures speak to her, and she understands. She designs with purpose and keeps the family balanced and connected.",
      personality: "Grounded · Intuitive · Loving", quote: "The earth is always talking. I just make sure we listen.",
      facts: ["Loves fresh flowers and essential oils", "Sketches her designs in nature", "Favorite color combo: purple & peach"],
      stats: { Nature: 92, Healing: 88, Design: 95, Calm: 90 }, sheet: "sc-krystal", pic: "p-krystal" },
    zavian: { name: "Zavian", age: 42, title: "Father · Engineer · Protector", role: "Electrical engineer", ability: "Light / fire manipulation",
      about: "Zavian is the foundation of the family. He builds systems that power cities, but his real power comes from within: he can generate, shape and control intense light, and turn it into heat and fire. He's the calmest in the family.",
      personality: "Calm · Wise · Protective", quote: "A true leader doesn't seek the spotlight, he creates the light.",
      facts: ["Loves jazz and classic soul", "Drinks black coffee every morning", "Built a solar power system for the family home"],
      stats: { Light: 99, Control: 96, Wisdom: 92, Calm: 97 }, sheet: "sc-zavian", pic: "p-zavian" },
    shawn: { name: "Coach Shawn Dixon", age: 43, title: "Basketball coach", role: "Coach at Kings University of Charlotte", ability: "",
      about: "Basketball coach at Kings University of Charlotte, and the voice in Zeke's ear on the court.", quote: "Discipline today creates the freedom you want tomorrow.", facts: [], stats: { Coaching: 95 }, sheet: "sc-dixons", pic: "p-shawn" },
    marcus: { name: "Marcus Dixon", age: 16, title: "Singer · Hooper · Streamer", role: "Best friends with Kingston", ability: "",
      about: "Singer, basketball player, streamer and vlogger. Best friends with Kingston.", quote: "", facts: [], stats: {}, sheet: "sc-dixons", pic: "p-marcus" },
    ajay: { name: "Ajay Dixon", age: 15, title: "Future marine biologist", role: "Animal lover", ability: "",
      about: "Into marine biology and veterinary medicine. Loves animals and conspiracy theories about the ocean.", quote: "", facts: [], stats: {}, sheet: "sc-dixons", pic: "p-ajay" },
    keisha: { name: "Dr. Keisha Dixon", age: 38, title: "Neurosurgeon", role: "Dominican and Black", ability: "",
      about: "A neurosurgeon, and the Dixon family's steady hand.", quote: "", facts: [], stats: {}, sheet: "sc-dixons", pic: "p-keisha" },
    berry: { name: "Berry", age: null, title: "The goodest boy", role: "The Dixons' dog", ability: "", about: "The goodest boy. Prince's best friend on the block.", quote: "", facts: [], stats: {}, sheet: "sc-dixons", pic: "p-berry" }
  },
  /* Real Charlotte places use public locations; pins are approximate. Story places are fictional. */
  places: [
    { id: "upendo", name: "The Upendo House", type: "story", sub: "Home base", lat: 35.2197, lng: -80.8128, scene: "/play/house", img: "h-ext", about: "Home base for the Upendo family. A story location; the address is fictional." },
    { id: "evolve", name: "Evolve Preparatory", type: "story", sub: "School", lat: 35.2392, lng: -80.8331, scene: "/play/school", img: "g-school", about: "Zeke's school. A story location; it isn't a real school." },
    { id: "court", name: "The Court", type: "missions", sub: "Basketball practice", lat: 35.2338, lng: -80.8275, scene: "/play/basketball", img: "g-court", about: "Where Coach Dixon runs practice. A story location." },
    { id: "freedom", name: "Freedom Park", type: "real", sub: "Park · 1900 East Blvd", lat: 35.1953, lng: -80.8436, img: "", about: "A 98-acre park with a lake, trails and fields in Dilworth. Zeke and Prince walk here when his mind gets heavy." },
    { id: "romare", name: "Romare Bearden Park", type: "real", sub: "Park · Uptown", lat: 35.2268, lng: -80.8480, about: "An Uptown park named for Charlotte-born artist Romare Bearden, with skyline views." },
    { id: "gantt", name: "Harvey B. Gantt Center", type: "real", sub: "African-American arts + culture · 551 S Tryon St", lat: 35.2243, lng: -80.8473, about: "The Harvey B. Gantt Center for African-American Arts + Culture in Uptown." },
    { id: "crown", name: "Bank of America Corporate Center", type: "real", sub: "The crown on the skyline", lat: 35.2272, lng: -80.8428, about: "Charlotte's tallest tower, topped with a crown of spires. In Zeke's dreams, it glows." },
    { id: "spectrum", name: "Spectrum Center", type: "real", sub: "Arena · Uptown", lat: 35.2251, lng: -80.8393, about: "Charlotte's downtown arena." },
    { id: "discovery", name: "Discovery Place Science", type: "real", sub: "Science museum · 301 N Tryon St", lat: 35.2296, lng: -80.8411, about: "Hands-on science museum in Uptown." },
    { id: "noda", name: "NoDa Arts District", type: "real", sub: "Neighborhood", lat: 35.2470, lng: -80.8015, about: "Charlotte's arts district, full of murals, music and galleries." },
    { id: "greenway", name: "Little Sugar Creek Greenway", type: "real", sub: "Greenway · Midtown", lat: 35.2117, lng: -80.8361, about: "A creekside trail that runs through the heart of the city." },
    { id: "jcsu", name: "Johnson C. Smith University", type: "real", sub: "HBCU · Beatties Ford Rd", lat: 35.2440, lng: -80.8594, about: "A historically Black university founded in 1867, west of Uptown." },
    { id: "merts", name: "Mert's Heart and Soul", type: "vybr8", sub: "Soul food · 214 N College St", lat: 35.2283, lng: -80.8405, img: "g-vybr8", about: "A long-running Black-owned soul food spot in Uptown. Find more spots near you on Vybr8." }
  ],
  missions: [
    { id: 1, title: "A Different Kind of Dream", brief: "Zeke wakes from a dream that felt too real. Figure out what it was trying to say.",
      steps: [{ k: "journal", t: "Check your dream journal", go: "/play/house" }, { k: "talk-krystal", t: "Talk to Mom (Krystal)", go: "/play/house" }, { k: "dream1", t: "Enter the daydream and find 3 clues", go: "/play/daydream" }], xp: 150, reward: "j1" },
    { id: 2, title: "School Day", brief: "Get to Evolve Prep, stay focused, and check in with the Dixons.",
      steps: [{ k: "visit-evolve", t: "Head to Evolve Preparatory", go: "/play/school" }, { k: "class", t: "Attend class and stay focused", go: "/play/school" }, { k: "talk-friends", t: "Talk to Ajay and Marcus", go: "/play/school" }], xp: 150, reward: "p1" },
    { id: 3, title: "Run the Court", brief: "Coach Dixon is watching. Put in the work.",
      steps: [{ k: "hoops", t: "Score 600+ in basketball practice", go: "/play/basketball" }, { k: "talk-coach", t: "Talk to Coach Dixon", go: "/play/school" }], xp: 200, reward: "m1" },
    { id: 4, title: "Something's Off", brief: "A migraine means a vision is close, or Zeke's mind is overloaded.",
      steps: [{ k: "migraine", t: "Rest at home: a migraine is coming on", go: "/play/house" }, { k: "walk-prince", t: "Walk with Prince at Freedom Park", go: "/map?p=freedom" }, { k: "dream2", t: "Daydream with a clear mind: find 4 clues", go: "/play/daydream" }], xp: 200, reward: "j2" },
    { id: 5, title: "Family First", brief: "Bring it home. Nobody carries a vision alone.",
      steps: [{ k: "talk-zavian", t: "Talk to Dad (Zavian)", go: "/play/house" }, { k: "talk-zora", t: "Talk to Zora", go: "/play/house" }, { k: "talk-kingston", t: "Talk to Kingston", go: "/play/house" }, { k: "checkin", t: "Check in at a Vybr8 spot with the family", go: "/map?p=merts" }], xp: 200, reward: "p2" },
    { id: 6, title: "The Message", brief: "One more vision. This time, Zeke has to understand it.",
      steps: [{ k: "dream3", t: "Daydream: find 5 clues", go: "/play/daydream" }, { k: "tell", t: "Tell the family what you saw", go: "/play/house" }], xp: 300, reward: "m2" }
  ],
  /* game text */
  visions: {
    dream1: ["A purple sky over Uptown.", "A crown glowing on the tallest tower.", "Prince barking at something only he can see."],
    dream2: ["Coach Dixon's whistle, echoing in an empty gym.", "A door at Evolve Prep that wasn't there before.", "Water rising without rain.", "Dad's hands full of light."],
    dream3: ["The whole family on the court at sunset.", "Words written in light: PROTECT THE VISION.", "Kingston's song playing backwards.", "Mom's flowers turning to face the north.", "A crown in the shadows, waiting."]
  },
  talk: {
    krystal: { "talk-krystal": [["krystal", "Morning, baby. You were talking in your sleep again."], ["zeke", "It felt real, Mom. The city was purple, and something was falling."], ["krystal", "The earth's been restless this week too. Write down what you saw, then let it breathe. Some dreams make sense later."]],
      "tell": [["zeke", "I saw the crown over the city. And a message: protect the vision."], ["krystal", "Then that's what we do. Together."], ["zavian", "Calm mind, strong heart. We move as a family."]],
      _: [["krystal", "Did you eat? Dreams take energy, Zeke."], ["krystal", "Smell that lavender? Breathe with me for a second."]] },
    zavian: { "talk-zavian": [["zavian", "Your mom told me about the dreams."], ["zeke", "What if I see something bad and can't stop it?"], ["zavian", "Then you won't face it alone. Light isn't about being the loudest. It's about showing the way."]],
      _: [["zavian", "Discipline is a kind of freedom. Remember that."], ["zavian", "I'm rewiring the porch lights. Hand me that? Thanks, champ."]] },
    zora: { "talk-zora": [["zora", "Zeke! Watch this!"], ["zora", "…okay, the water didn't listen. It'll listen next time."], ["zeke", "It will. You're getting stronger."], ["zora", "Pretty, powerful, and I move like water. Say it with me!"]],
      _: [["zora", "Can Prince be in my dance video? Please?"], ["zora", "Purple or glitter? Why not both."]] },
    kingston: { "talk-kingston": [["kingston", "You good, bro? You look like you didn't sleep."], ["zeke", "Not really."], ["kingston", "Headphones. I made something to clear your head. No powers needed, just the right sound."]],
      _: [["kingston", "Good sound builds legacies."], ["kingston", "Marcus owes me a hook for this beat."]] },
    ajay: { "talk-friends": [["ajay", "Is Prince outside? Tell him Berry said hi."], ["ajay", "Also, real talk: the ocean is hiding way more than they tell us."], ["marcus", "Lil Zeke! Tell Kingston I need that beat by Friday."]],
      _: [["ajay", "Did you know octopuses have three hearts?"]] },
    marcus: { _: [["marcus", "Coach got us running suicides today. Pray for me."]] },
    shawn: { "talk-coach": [["shawn", "Discipline today creates the freedom you want tomorrow. You bigger than just this moment, Zeke."]],
      _: [["shawn", "Again. Elbow in, follow through."]] },
    prince: { _: [["prince", "*tail wags* Prince bumps your hand. He's ready when you are."]] }
  },
  coachChoices: [["I hear you.", "Good. Hearing it is step one. Doing it every day is the rest."], ["It's hard sometimes.", "It's supposed to be. Hard is where you grow. I got you."], ["I'm ready.", "Then show me tomorrow. Six a.m."]],
  collect: {
    j1: { g: "Journal Pages", n: "Dream journal · page 1", img: "c-journal" }, j2: { g: "Journal Pages", n: "Dream journal · page 2", img: "c-journal" }, j3: { g: "Journal Pages", n: "Dream journal · page 3", img: "c-journal" },
    p1: { g: "Family Photos", n: "First day at Evolve", img: "c-photos" }, p2: { g: "Family Photos", n: "Family dinner", img: "c-photos" }, p3: { g: "Family Photos", n: "Upendo House, front steps", img: "h-ext" },
    m1: { g: "Music Tracks", n: "Kingston · Run the Court (beat)", img: "c-music" }, m2: { g: "Music Tracks", n: "Kingston · The Message (beat)", img: "c-music" },
    book: { g: "Journal Pages", n: "Reader bonus: Book 1 code", img: "sc-cover" }
  },
  outfits: [["hoodie", "Crown hoodie"], ["tee", "Peach tee"], ["jersey", "Court jersey (finish Run the Court)"]]
};
