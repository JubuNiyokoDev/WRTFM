import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useLogin } from '@workspace/api-client-react';

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { login } = useSession();
  const loginMutation = useLogin();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // For demo purposes, if API fails we fallback to fake login based on email
    loginMutation.mutate({ data: values }, {
      onSuccess: (res) => {
        login(res.user.role, res.token);
        setLocation(`/${res.user.role}`);
      },
      onError: () => {
        // Fallback demo behavior (no backend token)
        const role = values.email.includes('admin') ? 'admin' : values.email.includes('client') ? 'client' : 'worker';
        login(role, '');
        setLocation(`/${role}`);
      }
    });
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-display font-bold">Welcome back</CardTitle>
          <CardDescription>
            Log in to your WRTFM account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.email')}</FormLabel>
                    <FormControl>
                      <Input placeholder="name@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.password')}</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="pt-2">
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? t('general.loading') : t('nav.login')}
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground mt-4">
                Don't have an account? <a href="/auth/register" className="text-primary hover:underline">Sign up</a>
              </div>
              <div className="text-center text-xs text-muted-foreground mt-4 bg-muted p-2 rounded">
                Demo tip: Use "client@x.com", "worker@x.com" or "admin@x.com" to login as specific role.
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
