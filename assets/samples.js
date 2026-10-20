// Sample programs for the Python editor.
// Each entry: { name, code }. `name` shows in the Samples dropdown.
// Loading a sample copies its code into the editor (it never auto-runs).
//
// Keep these kid-friendly and short. Edit freely — this file is the single
// source of truth for the example list.

export const samples = [
  {
    name: "👋 Hello, world",
    code: `# Your very first program!
print("Hello, world! 👋")
print("Coding is fun 🎉")
`,
  },
  {
    name: "🙋 Ask my name",
    code: `# input() asks a question. Type your answer in the pop-up.
name = input("What is your name? ")
print("Hello,", name, "👋")
`,
  },
  {
    name: "🎲 Roll a dice",
    code: `import random

dice = random.randint(1, 6)
print("You rolled a", dice, "🎲")
`,
  },
  {
    name: "⭐ Star triangle",
    code: `# A loop that draws a little triangle of stars.
for row in range(1, 6):
    print("⭐" * row)
`,
  },
  {
    name: "🔢 Times table",
    code: `# Change the number and run again!
number = int(input("Which times table? "))

for i in range(1, 11):
    print(i, "x", number, "=", i * number)
`,
  },
  {
    name: "🎯 Guess the number",
    code: `import random

secret = random.randint(1, 20)
guess = 0

while guess != secret:
    guess = int(input("Guess a number (1-20): "))
    if guess < secret:
        print("Too low ⬆️")
    elif guess > secret:
        print("Too high ⬇️")

print("You got it! 🎉 The number was", secret)
`,
  },
  {
    name: "🌈 Favourite colour",
    code: `color = input("What is your favourite colour? ")
print("Cool! I like", color, "too 🌈")
`,
  },
  {
    name: "🧮 Simple calculator",
    code: `a = int(input("First number: "))
b = int(input("Second number: "))

print(a, "+", b, "=", a + b)
print(a, "-", b, "=", a - b)
print(a, "x", b, "=", a * b)
`,
  },
  {
    name: "🌤️ API: Weather (Open-Meteo)",
    code: `# Fetch the current weather for London from the free Open-Meteo API.
# No API key needed!
import requests

url = "https://api.open-meteo.com/v1/forecast"
params = {
    "latitude": 51.51,     # London
    "longitude": -0.13,
    "current_weather": True,
}

response = requests.get(url, params=params)
data = response.json()

weather = data["current_weather"]
print("🌡️ Temperature:", weather["temperature"], "°C")
print("💨 Wind speed:", weather["windspeed"], "km/h")
`,
  },
  {
    name: "🐶 API: Dog fact",
    code: `# Get a random dog fact from a free, no-key API.
import requests

response = requests.get("https://dogapi.dog/api/v2/facts")
data = response.json()

# The fact is tucked inside the JSON: data -> first item -> attributes -> body
fact = data["data"][0]["attributes"]["body"]
print("🐶", fact)
`,
  },
  {
    name: "🐱 API: Cat fact",
    code: `# Get a random cat fact from a free, no-key API.
import requests

response = requests.get("https://catfact.ninja/fact")
data = response.json()

# This API is simpler: the fact is right at the top of the JSON.
print("🐱", data["fact"])
`,
  },
  {
    name: "🪟 GUI: hello buttons",
    code: `# A little window with a label and two buttons.
from guizero import App, Text, PushButton

def say_hello():
    message.value = "Hello! 👋"

def say_bye():
    message.value = "Goodbye! 👋"

app = App(title="My first GUI")

message = Text(app, text="Press a button")
PushButton(app, text="Say hello", command=say_hello)
PushButton(app, text="Say goodbye", command=say_bye)

app.display()
`,
  },
  {
    name: "🧾 GUI: form (grid)",
    code: `# Widgets lined up in a grid: label + box on each row.
from guizero import App, Text, TextBox, PushButton, Combo, CheckBox

def greet():
    name = name_box.value
    color = color_combo.value
    loud = "!!!" if shout.value else "."
    result.value = f"Hi {name}, you like {color}{loud}"

app = App(title="Greeter", layout="grid")

Text(app, text="Name", grid=[0, 0], align="left")
name_box = TextBox(app, grid=[1, 0])

Text(app, text="Colour", grid=[0, 1], align="left")
color_combo = Combo(app, options=["red", "green", "blue"], grid=[1, 1])

shout = CheckBox(app, text="Shout it", grid=[1, 2], align="left")

PushButton(app, text="Greet me", command=greet, grid=[0, 3])
result = Text(app, text="", grid=[1, 3], align="left")

app.display()
`,
  },
  {
    name: "🎚️ GUI: colour mixer (slider)",
    code: `# Sliders with event handlers that update a label live.
from guizero import App, Text, Slider, ButtonGroup

def update(value=None):
    picked = pick.value
    result.value = f"You picked: {picked} (slider at {level.value})"

app = App(title="Picker")

pick = ButtonGroup(app, options=["Apple", "Banana", "Cherry"],
                   selected="Apple", command=update)

Text(app, text="How many?")
level = Slider(app, start=1, end=10, command=update)

result = Text(app, text="You picked: Apple (slider at 1)")

app.display()
`,
  },
  {
    name: "🔤 NATO spelling (speaks)",
    code: `# Type some text, then spell it out loud using the NATO alphabet.
import pyttsx3

# The NATO phonetic word for each letter and digit.
NATO = {
    "A": "Alpha",   "B": "Bravo",    "C": "Charlie", "D": "Delta",
    "E": "Echo",    "F": "Foxtrot",  "G": "Golf",    "H": "Hotel",
    "I": "India",   "J": "Juliett",  "K": "Kilo",    "L": "Lima",
    "M": "Mike",    "N": "November",  "O": "Oscar",   "P": "Papa",
    "Q": "Quebec",  "R": "Romeo",    "S": "Sierra",  "T": "Tango",
    "U": "Uniform", "V": "Victor",   "W": "Whiskey", "X": "X-ray",
    "Y": "Yankee",  "Z": "Zulu",
    "0": "Zero",    "1": "One",      "2": "Two",     "3": "Tree",
    "4": "Fower",   "5": "Five",     "6": "Six",     "7": "Seven",
    "8": "Eight",   "9": "Nine",
}

engine = pyttsx3.init()

text = input("Type something to spell out: ")

engine.say(f"Using the NATO phonetic alphabet, {text} spells out as:")
engine.runAndWait()

for char in text:
    key = char.upper()
    if key in NATO:                    # a letter or a digit we know
        word = NATO[key]
        print(char, "->", word)
        engine.say(word)
        engine.runAndWait()
    else:
        print(char)                    # spaces, punctuation, etc.
`,
  },
  {
    name: "🎨 Rich: colourful text",
    code: `# Rich makes colourful, styled text easy.
from rich import print

print("[bold red]Hello[/] [green]world[/] 🌈")
print("[yellow]You can [underline]underline[/underline] and [italic]slant[/italic] too![/]")
print("[white on blue] Highlighted [/] and [dim]quiet[/] text.")
`,
  },
  {
    name: "📊 Rich: table",
    code: `# A neat table with borders and coloured columns.
from rich.console import Console
from rich.table import Table

table = Table(title="🍓 Fruit basket")
table.add_column("Fruit", style="cyan")
table.add_column("Count", justify="right", style="magenta")
table.add_column("Yummy?", justify="center")

table.add_row("Apples", "12", "✅")
table.add_row("Bananas", "7", "✅")
table.add_row("Lemons", "3", "😐")

Console().print(table)
`,
  },
  {
    name: "🌳 Rich: tree",
    code: `# A tree shows things that branch, like folders or a family of pets.
from rich.console import Console
from rich.tree import Tree

tree = Tree("🌳 My stuff")

pets = tree.add("🐾 Pets")
pets.add("🐶 Dog")
cats = pets.add("🐱 Cats")
cats.add("Tom")
cats.add("Felix")

toys = tree.add("🧸 Toys")
toys.add("Lego")
toys.add("Kite")

Console().print(tree)
`,
  },
  {
    name: "🌀 Turtle: rainbow spiral",
    code: `# A spiral that changes colour as it grows.
import turtle as tt

tt.bgcolor("black")
tt.pensize(2)

for i in range(80):
    tt.pencolor(tt.hsb(i * 4, 1.0, 1.0))   # cycle through the rainbow
    tt.forward(i * 3)
    tt.left(91)
`,
  },
  {
    name: "⭐ Turtle: star",
    code: `# A pointy star. Change N to get more points!
import turtle as tt

N = 5                      # number of points on the star
angle = 180 - 180 / N      # the turn angle for an N-pointed star

tt.bgcolor("navy")
tt.pencolor("red")
tt.fillcolor("yellow")
tt.pensize(10)

tt.begin_fill()
for point in range(N):
    tt.forward(200)
    tt.right(angle)
tt.end_fill()

tt.hideturtle()
`,
  },
  {
    name: "🌸 Turtle: flower",
    code: `# Draw a flower by spinning a circle around and around.
import turtle as tt

tt.bgcolor("white")
tt.pensize(2)

petals = 18
for i in range(petals):
    tt.pencolor(tt.hsb(i * (360 / petals), 1.0, 1.0))
    tt.circle(100)                 # one petal (a full circle)
    tt.left(360 / petals)          # turn a little before the next
`,
  },
];
