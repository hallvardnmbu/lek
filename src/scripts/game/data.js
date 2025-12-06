// game/data.js

export const ACTIONS = {
    low: [1, 2, 3, 4, 5],
    medium: [3, 4, 5, 6],
    high: [5, 6, 7, 8],
};

export const CATEGORIES = [
    "Dyr", "Land", "Filmer", "Sanger", "Mat", "Farger",
    "Sport", "Kjendiser", "TV-serier", "Bøker", "Biler", "Drinker",
    "Ting på kjøkkenet", "Ting på badet",
    "Ting som er runde", "Ting som er kalde", "Brettspill",
    "Videospill", "Ting som flyr", "Ting med hjul"
];

export const MOST_LIKELY_TO = [
    "bli arrestert", "bli kjent", "vinne i lotto", "glemme sin egen bursdag",
    "bli millionær", "gå seg vill i eget nabolag", "spise noe rart",
    "danse på bordet", "synge karaoke edru", "gråte til en film", "le i en begravelse",
    "ta tatovering i fylla", "bli vegetarianer", "flytte til et annet land",
    "få flest barn", "bli lærer", "bli politiker", "hoppe i fallskjerm",
    "overleve en zombieapokalypse", "bli realitystjerne", "gifte seg først"
];

export const LYRICS = [
    ["Eminem", "RAP GOD", "Look, I was gonna go easy on you not to hurt your feelings. But I'm only going to get this one chance (Six minutes—, six minutes—). Something's wrong, I can feel it."],
    ["Cardi B", "WAP", "Whores in this house. There's some whores in this house. There's some whores in this house. There's some whores in this house (Hol' up). I said certified freak, seven days a week"],
    ["Ed Sheeran", "Shape of You", "A club isn't the best place to find a lover. So the bar is where I go (Mm). Me and my friends at the table doin' shots. Drinkin' fast and then we talk slow (Mm)."],
    ["Kendrick Lamar", "Humble", "Ayy, I remember syrup sandwiches and crime allowances. Finesse a nigga with some counterfeits, but now I'm countin’ this."],
    ["The Weeknd", "The Hills", "I only call you when it's half-past five. The only time that I'll be by your side. I only love it when you touch me, not feel me. When I'm fucked up, that's the real me."],
    ["Queen", "Bohemian Rhapsody", "Mama, life had just begun. But now I've gone and thrown it all away. Mama, ooh, didn't mean to make you cry. If I'm not back again this time tomorrow."],
    ["Migos", "Bad and Boujee", "Fuckin' on your bitch, she a thot, thot (Thot). Cookin' up dope in the crockpot (Pot). We came from nothin' to somethin', nigga (Hey)"],
    ["Travis Scott", "Sicko mode", "Sun is down, freezin' cold. That's how we already know, winter's here. My dawg would probably do it for a Louis belt. That's just all he know, he don't know nothin' else"],
    ["Drake", "Gods plan", "She say, Do you love me? I tell her, Only partly I only love my bed and my mama, I'm sorry"],
    ["Big Shaq", "Mans not hot", "Pop, pop, ka-ka-ka (Ka-ka). Skidi-ki-pop-pop (Pah). And a pu-pu-brr-boom (Boom). Ski-ya (Ah). Du-du-ku-ku-dun-dun (Dun). Poom, poom. You dun know"],
    ["Total Eclpse of the Heart", "Bonnie Tyler", "(Turn around) Every now and then I get a little bit lonely And you’re never coming ’round (Turn around) Every now and then I get a little bit tired Of  listening to the sound of my tears"],
    ["Outkast", "Hey Ya", "You think you’ve got it Oh, you think you’ve got it But got it just don’t get it when there’s nothin’ at all We get together Oh, we get together"],
    ["Pink Floyd", "Wish You Were Here", "So, so you think you can tell. Heaven from hell. Blue skies from  pain Can you tell a green field From a cold steel rail? A smile from a veil? Do you think you can tell?"],
    ["Cat Stevens", "Father and Son", "It's not time to make a change, Just relax, take it easy You're still young, that's your fault, There's so much you have to know Find a girl, settle down, If you want you can marry Look at me, I am old, but I'm happy"],
    ["Nirvana", "Smells Like Teen Spirit", "Load up on guns, bring your friends It's fun to lose and to pretend She's over-bored and self-assured Oh no, I know a dirty word Hello, hello, hello, how low Hello, hello, hello, how low Hello, hello, hello, how low Hello, hello, hello"],
    ["Coldplay", "The Scientist", "Tell me you love me Come back and haunt me Oh and I rush to the start Running in circles, chasing our tails Coming back as we are"],
    ["Imagine Dragons", "Believer", "Pain! You made me a, you made me a"],
    ["Lady Gaga and Bradley Cooper", "Shallow", "Tell me something, boy Aren't you tired tryna fill that  void? Or do you need more? Ain't it hard keepin' it so hardcore?"],
    ["Leonard Cohen", "Hallelujah", "Now I've heard there was a secret chord That David played and it pleased the Lord But you don't really care for music, do ya? It goes like this, the fourth, the fifth The minor fall, the major lift"],
    ["Arctic Monkeys", "Do I wanna Know", "Crawlin' back to you Ever thought of callin' when You've had a few? 'Cause I always do Maybe I'm too Busy bein' yours To fall for somebody new Now, I've thought it through Crawlin' back to you"],
    ["Hozier", "Take me to Church", "My lover's got humour She's the giggle at a funeral Knows everybody's  disapproval They should've worshipped her sooner If the heavens ever did speak She's the last true mouthpiece"],
    ["The Killers", "Mr Brightside", "Jealousy, turning saints into the sea Swimming through sick lullabies, choking on your alibis But it's just the price I pay, destiny is calling me Open up my eager eyes, 'cause I'm"],
    ["Journey", "Believer", "Just a small-town girl, livin' in a lonely world She took the midnight train goin' anywhere Just a city boy, born and raised in South Detroit He took the midnight train goin' anywhere"],
    ["Eagles", "Hotel California", "On a dark desert highway Cool wind in my hair Warm smell of colitas Rising up through the air"],
    ["Rage Against the Machine", "Killing in the Name", "Those who died are justified For wearing the badge, they're the chosen whites You justify those that died By wearing the badge, they're the chosen whites Those who died are justified"],
    ["Kanye West", "Black Skinhead", "Four in the mornin', and I'm zonin' They say I'm possessed, it's an  omen I keep it 300, like the Romans 300 bitches, where the Trojans?"],
    ["Foster the People", "Pumped Up Kicks", "Robert's got a quick hand He'll look around the room, he won't tell you his plan He's got a rolled cigarette Hanging out his mouth, he's a cowboy kid"],
    ["Gorillaz", "Feel Good Inc", "Windmill, windmill for the land Turn forever, hand in hand Take it all in on your stride It is ticking, falling down Love forever, love is free"],
    ["Radiohead", "Creep", "When you were here before Couldn't look you in the eye You're just like an angel Your skin makes me cry You float like a feather In a beautiful world I wish I was special You're so fuckin' special"],
    ["Harry Styles", "Watermelon Sugar", "Tastes like strawberries on a summer evenin' And it sounds just like a song I want more berries and that summer feelin' It's so wonderful and warm"]
];
