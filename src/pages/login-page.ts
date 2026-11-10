import type { Locator } from '@playwright/test';
import { BasePage } from './base-page.js';

export class LoginPage extends BasePage {
  async open(): Promise<void> {
    await this.page.goto('/');
  }

  async login(username: string, password: string): Promise<void> {
    await (await this.username()).fill(username);
    await (await this.password()).fill(password);
    await (await this.submitButton()).click();
  }

  errorMessage(): Promise<Locator> {
    return this.find('errorMessage', [
      { description: 'testId=error', build: (p) => p.getByTestId('error') },
      { description: 'css=.error-message-container h3', build: (p) => p.locator('.error-message-container h3') },
    ]);
  }

  private username(): Promise<Locator> {
    return this.find('username', [
      { description: 'testId=username', build: (p) => p.getByTestId('username') },
      { description: 'placeholder=Username', build: (p) => p.getByPlaceholder('Username') },
      { description: 'css=#user-name', build: (p) => p.locator('#user-name') },
    ]);
  }

  private password(): Promise<Locator> {
    return this.find('password', [
      { description: 'testId=password', build: (p) => p.getByTestId('password') },
      { description: 'placeholder=Password', build: (p) => p.getByPlaceholder('Password') },
      { description: 'css=#password', build: (p) => p.locator('#password') },
    ]);
  }

  private submitButton(): Promise<Locator> {
    return this.find('submitButton', [
      { description: 'testId=login-button', build: (p) => p.getByTestId('login-button') },
      { description: 'role=button[name=Login]', build: (p) => p.getByRole('button', { name: 'Login' }) },
      { description: 'css=#login-button', build: (p) => p.locator('#login-button') },
    ]);
  }
}
