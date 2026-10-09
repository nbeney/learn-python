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
];
