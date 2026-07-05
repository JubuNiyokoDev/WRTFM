import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { useSession } from '@/hooks/use-session';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRegister } from '@/api-client';
import { useToast } from '@/hooks/use-toast';
import { ProductMark } from '@/components/product-mark';
import { AppIllustration } from '@/components/illustrations';

const formSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['client', 'worker']),
  country: z.string().min(2),
});

export default function Register() {
  const { t, lang } = useTranslation();
  const [, setLocation] = useLocation();
  const { login } = useSession();
  const registerMutation = useRegister();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'worker',
      country: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    registerMutation.mutate({ data: { ...values, language: lang } }, {
      onSuccess: (res) => {
        login(res.user.role, res.token);
        setLocation(`/${res.user.role}`);
      },
      onError: (error: any) => {
        toast({
          title: t('general.error'),
          description: error?.data?.error || error.message || 'Registration failed',
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <div className="grid flex-1 items-center gap-3 p-3.5 py-6 sm:gap-4 sm:p-4 lg:grid-cols-[minmax(0,1fr)_430px] lg:px-6 xl:px-8">
      <div className="hidden min-h-[560px] flex-col justify-between rounded-[18px] border border-border bg-card p-5 lg:flex">
        <ProductMark />
        <div className="mx-auto w-full max-w-sm">
          <AppIllustration kind="earn" className="mx-auto max-w-[280px]" fit="cover" />
          <h1 className="mt-6 text-lg font-bold">{t('auth.register.description')}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.footer.promise')}</p>
        </div>
      </div>
      <Card className="app-panel mx-auto w-full max-w-md border-border/80 bg-card/90 shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <ProductMark className="mx-auto mb-4 justify-center" showName={false} />
          <CardTitle className="text-lg sm:text-xl font-display font-bold">{t('auth.register.title')}</CardTitle>
          <CardDescription>
            {t('auth.register.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.register.intent')}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('auth.register.select_role')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="client">{t('auth.register.post_tasks')}</SelectItem>
                          <SelectItem value="worker">{t('auth.register.earn_money')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.country')}</FormLabel>
                      <FormControl>
                        <Input placeholder="US, FR, UK..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="pt-2">
                <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? t('general.loading') : t('nav.register')}
                </Button>
              </div>

              <div className="text-center text-sm text-muted-foreground mt-4">
                {t('auth.register.has_account')} <a href="/auth/login" className="font-semibold text-primary hover:underline">{t('nav.login')}</a>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
