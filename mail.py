import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from threading import Thread

from secrets import (
  user,
  password,
  )

smtp = None

def connect_to_mail_server():
  global smtp
  smtp = smtplib.SMTP('smtp.gmail.com', 587)
  smtp.starttls()
  smtp.login(user, password)

def send_mail_async(to, subject, text, html=None):
  thread = Thread(target=lambda: send_mail(to, subject, text, html))
  thread.start()

def send_mail(to, subject, text, html=None):
  global smtp
  if not smtp:
    connect_to_mail_server()
 
  msg = MIMEMultipart('alternative')
  msg['Subject'] = subject
  msg['From'] = 'predictionbazaar.com admin <%s>' % (user,)
  msg['To'] = to

  msg.attach(MIMEText(text, 'plain'))
  if html:
    msg.attach(MIMEText(html, 'html'))

  try:
    smtp.sendmail(user, to, msg.as_string())
  except (smtplib.SMTPServerDisconnected, smtplib.SMTPException):
    connect_to_mail_server()
    smtp.sendmail(user, to, msg.as_string())
