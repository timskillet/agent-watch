export {};

// Test file with intentional bugs for validating Claude PR review workflow

export function processUserData(data: any) {
  // Bug: no null check on data
  const name = data.user.name.toUpperCase();
  const age = data.user.age;

  // Bug: SQL injection vulnerability
  const query = `SELECT * FROM users WHERE name = '${name}'`;

  // Bug: division without zero check
  const ratio = age / data.user.divisor;

  return { name, age, query, ratio };
}

export function fetchConfig(url: string): Promise<any> {
  // Bug: no error handling on fetch
  return fetch(url).then((res) => res.json());
}

export function calculateDiscount(price: number, discount: number): number {
  // Bug: no validation that discount is between 0 and 1
  return price * discount;
}
