import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { PageContainer } from '@/components/layout/PageContainer'
import { Text } from '@/components/ui/text'
import { Send, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

interface Message {
  id: number
  senderId: string
  content: string
  timestamp: Date
  isOwn: boolean
}

interface ChatPartner {
  id: string
  name: string
  avatar: string
  lastMessage: string
  online: boolean
  unread: number
}

const mockPartners: ChatPartner[] = [
  { id: '1', name: 'CryptoKing', avatar: 'https://images.unsplash.com/photo-1472099645745-095597429a3b?auto=format&fit=crop&q=80&w=100&h=100', lastMessage: 'Yes, I can do that for 52,400', online: true, unread: 2 },
  { id: '2', name: 'trade84', avatar: '', lastMessage: 'Thanks for the trade!', online: false, unread: 0 },
  { id: '3', name: 'Brianx786', avatar: '', lastMessage: 'SEPA is fine', online: true, unread: 1 },
  { id: '4', name: 'TokyoTrade', avatar: '', lastMessage: 'How much USDT do you have?', online: false, unread: 0 },
]

const mockMessages: Record<string, Message[]> = {
  '1': [
    { id: 1, senderId: '1', content: 'Hey, interested in your BTC offer', timestamp: new Date(Date.now() - 3600000 * 2), isOwn: false },
    { id: 2, senderId: 'me', content: 'Sure, how much are you looking for?', timestamp: new Date(Date.now() - 3600000 * 1.5), isOwn: true },
    { id: 3, senderId: '1', content: 'I need 0.25 BTC', timestamp: new Date(Date.now() - 3600000), isOwn: false },
    { id: 4, senderId: '1', content: 'Yes, I can do that for 52,400', timestamp: new Date(Date.now() - 1800000), isOwn: false },
  ],
}

export function ChatPage() {
  const [selectedPartner, setSelectedPartner] = useState<ChatPartner | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [partners, setPartners] = useState<ChatPartner[]>(mockPartners)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const selectPartner = (partner: ChatPartner) => {
    setSelectedPartner(partner)
    setMessages(mockMessages[partner.id] || [])
    setPartners(prev => prev.map(p =>
      p.id === partner.id ? { ...p, unread: 0 } : p
    ))
  }

  const sendMessage = () => {
    if (!inputValue.trim() || !selectedPartner) return

    const newMessage: Message = {
      id: messages.length + 1,
      senderId: 'me',
      content: inputValue,
      timestamp: new Date(),
      isOwn: true,
    }

    setMessages(prev => [...prev, newMessage])
    setInputValue('')

    // Update partner's last message
    setPartners(prev => prev.map(p =>
      p.id === selectedPartner.id ? { ...p, lastMessage: inputValue } : p
    ))

    // Simulate reply after short delay
    setTimeout(() => {
      const reply: Message = {
        id: messages.length + 2,
        senderId: selectedPartner.id,
        content: 'Received. I will get back to you shortly.',
        timestamp: new Date(),
        isOwn: false,
      }
      setMessages(prev => [...prev, reply])
      setPartners(prev => prev.map(p =>
        p.id === selectedPartner.id ? { ...p, lastMessage: 'Received. I will get back to you shortly.' } : p
      ))
    }, 1500)
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-3/4 left-1/2 w-96 h-96 bg-blue-900/20 rounded-full blur-[120px]" />
      </div>

      <Navbar showTabs />
      <main className="flex-1">
        <PageContainer type="app">
          <section className="py-8">
            <div className="flex h-[600px] glass-panel rounded-2xl overflow-hidden">
              {/* Chat list sidebar */}
              <div className={`border-r border-border ${selectedPartner ? 'hidden md:block md:w-80' : 'w-full md:w-80'}`}>
                <div className="p-4 border-b border-border">
                  <Text variant="h4" className="font-bold">Messages</Text>
                </div>
                <div className="overflow-y-auto">
                  {partners.map(partner => (
                    <button
                      key={partner.id}
                      onClick={() => selectPartner(partner)}
                      className={`w-full p-4 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left ${
                        selectedPartner?.id === partner.id ? 'bg-muted/50' : ''
                      }`}
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={partner.avatar} />
                          <AvatarFallback>{partner.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        {partner.online && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <Text variant="small" className="font-semibold truncate">{partner.name}</Text>
                          {partner.unread > 0 && (
                            <span className="bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                              {partner.unread}
                            </span>
                          )}
                        </div>
                        <Text variant="muted" className="text-sm truncate">{partner.lastMessage}</Text>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat area */}
              {selectedPartner && (
                <div className="flex-1 flex flex-col">
                  {/* Chat header */}
                  <div className="p-4 border-b border-border flex items-center gap-3">
                    <button
                      onClick={() => setSelectedPartner(null)}
                      className="md:hidden text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={selectedPartner.avatar} />
                        <AvatarFallback>{selectedPartner.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {selectedPartner.online && (
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                      )}
                    </div>
                    <div>
                      <Text variant="small" className="font-semibold">{selectedPartner.name}</Text>
                      <Text variant="muted" className="text-sm">
                        {selectedPartner.online ? 'Online' : 'Offline'}
                      </Text>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map(message => (
                      <div
                        key={message.id}
                        className={`flex ${message.isOwn ? 'justify-end' : 'justify-start'}`}
                      >
                        {!message.isOwn && (
                          <Avatar className="h-8 w-8 mr-2 mt-1">
                            <AvatarImage src={selectedPartner.avatar} />
                            <AvatarFallback>{selectedPartner.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                        )}
                        <div className="flex flex-col max-w-[70%]">
                          <div
                            className={`px-4 py-2 rounded-2xl ${
                              message.isOwn
                                ? 'bg-primary text-primary-foreground rounded-tr-none'
                                : 'bg-muted text-foreground rounded-tl-none'
                            }`}
                          >
                            <p className="text-sm">{message.content}</p>
                          </div>
                          <span className={`text-xs text-muted-foreground mt-1 ${
                            message.isOwn ? 'text-right' : 'text-left'
                          }`}>
                            {formatTime(message.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Input area */}
                  <div className="p-4 border-t border-border">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Type a message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                        className="rounded-full"
                      />
                      <Button
                        onClick={sendMessage}
                        size="icon"
                        className="rounded-full"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* No selection state */}
              {!selectedPartner && (
                <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Text variant="h4" className="font-bold mb-2">Select a conversation</Text>
                    <Text variant="muted">Choose from your existing chats to start messaging</Text>
                  </div>
                </div>
              )}
            </div>
          </section>
        </PageContainer>
      </main>
      <Footer />
    </div>
  )
}
