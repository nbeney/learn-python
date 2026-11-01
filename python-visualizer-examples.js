// Examples for python-visualizer.html. Edit freely: each example has a title, code and (optional) stdin.
// Put the text between the backticks as-is (a leading newline is ignored). Avoid backticks and ${ inside code.
window.PV_EXAMPLES = {
  "Basics": [
    {
      title: "Variables and types",
      code: `
age = 12
name = "Zoe"
height = 1.55
is_kid = age < 18
nothing = None
age = age + 1
`
    },
    {
      title: "Loop and input",
      code: `
n = int(input("How many? "))
total = 0
for i in range(1, n + 1):
    total = total + i
print("Sum:", total)
`,
      stdin: `
4`
    },
  ],
  "Functions": [
    {
      title: "Factorial (recursion)",
      code: `
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))
`
    },
    {
      title: "Default parameters",
      code: `
def add_item(item, basket=[], count=1):
    basket.append(item)
    return basket

print(add_item("apple"))
print(add_item("pear"))
`
    },
  ],
  "Data structures": [
    {
      title: "Lists and aliases",
      code: `
a = [1, 2, 3]
b = a
b.append(4)
c = list(a)
c.append(5)
print(a, b, c)
`
    },
    {
      title: "Grid (list of lists)",
      code: `
grid = [[0] * 3 for _ in range(3)]
for i in range(3):
    grid[i][i] = 1
print(grid)
`
    },
    {
      title: "Dictionary",
      code: `
ages = {"Ann": 10, "Bob": 12}
ages["Cy"] = 9
for k in ages:
    ages[k] += 1
print(ages)
`
    },
  ],
  "Classes": [
    {
      title: "Person class",
      code: `
class Person:
    def __init__(self, name):
        self.name = name
        self.friends = []

    def add_friend(self, other):
        self.friends.append(other)

ann = Person("Ann")
bob = Person("Bob")
ann.add_friend(bob)
`
    },
  ],
  "Errors": [
    {
      title: "ZeroDivisionError",
      code: `
def ratio(a, b):
    return a / b

print(ratio(6, 3))
print(ratio(1, 0))
`
    },
    {
      title: "Syntax error",
      code: `
x = 5
if x > 3
    print("big")
`
    },
  ],
};
