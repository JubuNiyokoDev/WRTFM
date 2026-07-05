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
import { useLogin } from '@/api-client';
import { useToast } from '@/hooks/use-toast';
import { ProductMark } from '@/components/product-mark';
import { AppIllustration } from '@/components/illustrations';

const formSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export default function Login() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { login } = useSession();
  const loginMutation = useLogin();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    loginMutation.mutate({ data: values }, {
      onSuccess: (res) => {
        login(res.user.role, res.token);
        setLocation(`/${res.user.role}`);
      },
      onError: (error: any) => {
        toast({
          title: t('general.error'),
          description: error?.data?.error || error.message || 'Invalid email or password',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <div className="grid flex-1 items-center gap-3 p-3.5 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_400px] lg:px-6 xl:px-8">
      <div className="hidden min-h-[520px] flex-col justify-between rounded-[18px] border border-border bg-card p-5 lg:flex">
        <ProductMark />
        <div className="mx-auto w-full max-w-sm">
          <AppIllustration kind="proof" className="mx-auto max-w-[280px]" fit="contain" />
          <h1 className="mt-6 text-lg font-bold">{t('home.hero.badge')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.engine.copy')}</p>
        </div>
      </div>
      <Card className="app-panel mx-auto w-full max-w-md border-border/80 bg-card/90 shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <ProductMark className="mx-auto mb-4 justify-center" showName={false} />
          <CardTitle className="text-lg sm:text-xl font-display font-bold">{t('auth.login.title')}</CardTitle>
          <CardDescription>
            {t('auth.login.description')}
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
                {t('auth.login.no_account')} <a href="/auth/register" className="font-semibold text-primary hover:underline">{t('nav.register')}</a>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
